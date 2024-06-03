import { Aspects, CfnResource, Duration, RemovalPolicy, Stack, StackProps, Stage, StageProps, Tags } from 'aws-cdk-lib';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { CfnOriginAccessControl, Distribution, GeoRestriction, HttpVersion, PriceClass, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { AccountRootPrincipal, CfnRole, CompositePrincipal, Effect, PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { CfnFunction } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { ARecord, PublicHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { BlockPublicAccess, Bucket, BucketAccessControl, ObjectOwnership, StorageClass } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { RegionInfo } from 'aws-cdk-lib/region-info';
import { AwsSolutionsChecks, NagReportFormat, NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { join } from 'path';

export class SteloWebCDNStack extends Stack {
  constructor(scope: Construct, props: Omit<StackProps, 'description' | 'stackName' | 'terminationProtection'>) {
    super(scope, 'CDNStack', {
      stackName: 'stelo-web-cdn',
      description: 'CDN resources for stelo websites',
      terminationProtection: true,
      ...props
    });
    Aspects.of(this).add(new AwsSolutionsChecks({ verbose: true, reportFormats: [NagReportFormat.JSON] }));

    Tags.of(this).add('stelo:app', 'website');
    Tags.of(this).add('stelo:website:entity', 'infrastructure');
    const regionInfo = RegionInfo.get(this.region);

    const encryptionKey = new Key(this, 'EncryptionKey', {
      enabled: true,
      enableKeyRotation: true,
      description: 'Encryption key for stelo-web resources.',
      removalPolicy: RemovalPolicy.DESTROY,
      alias: 'alias/stelo/web'
    });
    encryptionKey.grantEncryptDecrypt(
      new CompositePrincipal(
        new AccountRootPrincipal(),
        ...['s3.amazonaws.com', 'logs.amazonaws.com', 'delivery.logs.amazonaws.com', 'cloudfront.amazonaws.com'].map(
          sp => new ServicePrincipal(regionInfo.servicePrincipal(sp) ?? '')
        )
      )
    );

    const logsBucket = new Bucket(this, 'LogsBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      encryptionKey,
      bucketName: 'access.logs.stelo.dev',
      autoDeleteObjects: true,
      enforceSSL: true,
      minimumTLSVersion: 1.2,
      accessControl: BucketAccessControl.LOG_DELIVERY_WRITE,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      objectOwnership: ObjectOwnership.OBJECT_WRITER,
      lifecycleRules: [
        { expiration: Duration.days(90), id: 'ttl', transitions: [{ transitionAfter: Duration.days(30), storageClass: StorageClass.INFREQUENT_ACCESS }] }
      ]
    });

    const destinationBucket = new Bucket(this, 'AssetsBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      encryptionKey,
      serverAccessLogsBucket: logsBucket,
      serverAccessLogsPrefix: 'stelo.dev/bucket/',
      bucketName: 'stelo.dev',
      autoDeleteObjects: true,
      enforceSSL: true,
      minimumTLSVersion: 1.2,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL
    });

    const bucketDeployment = new BucketDeployment(this, 'AssetsDeployment', {
      sources: [Source.asset(join(__dirname, `../../../${process.env.CODEBUILD_BUILD_ARN ? 'cdn' : 'stelo.cdn'}/assets/`))],
      destinationBucket
    });

    const deploymentFn = this.node.findChild('Custom::CDKBucketDeployment8693BB64968944B69AAFB0CC9EB8756C').node.findChild('Resource') as CfnFunction;
    deploymentFn.runtime = 'python3.12';
    deploymentFn.functionName = 'stelo-web-assets-deployment';
    const deploymentFnLogs = new LogGroup(this, 'AssetsDeploymentFunctionLogs', {
      logGroupName: `/aws/lambda/${deploymentFn.functionName}`,
      removalPolicy: RemovalPolicy.DESTROY,
      retention: RetentionDays.TWO_MONTHS,
      encryptionKey
    });
    bucketDeployment.node.findChild('CustomResource').node.addDependency(deploymentFnLogs);

    const serviceRole = this.node.findChild('Custom::CDKBucketDeployment8693BB64968944B69AAFB0CC9EB8756C').node.findChild('ServiceRole');
    (serviceRole.node.defaultChild as CfnRole).roleName = 'stelo-web-assets-deployment-role';
    NagSuppressions.addResourceSuppressions(serviceRole, [{ id: 'AwsSolutions-IAM4', reason: 'Managed policies are auto-added' }]);
    NagSuppressions.addResourceSuppressions(serviceRole.node.findChild('DefaultPolicy'), [{ id: 'AwsSolutions-IAM5', reason: 'Policies are auto-added' }]);

    const domainName = 'cdn.stelo.dev';
    const hostedZone = new PublicHostedZone(this, 'AssetsHostedZone', {
      zoneName: domainName,
      caaAmazon: true,
      comment: `Delegation for ${domainName} resources`
    });
    const certificate = new Certificate(this, 'AssetsCertificate', {
      domainName,
      certificateName: 'stelo-cdn',
      validation: CertificateValidation.fromDns(hostedZone)
    });

    const oac = new CfnOriginAccessControl(this, 'OriginAccessControl', {
      originAccessControlConfig: {
        description: 'sigv4 for stelo.dev origin bucket',
        name: destinationBucket.bucketRegionalDomainName,
        originAccessControlOriginType: 's3',
        signingBehavior: 'always',
        signingProtocol: 'sigv4'
      }
    });
    const distro = new Distribution(this, 'AssetsDistro', {
      domainNames: ['cdn.stelo.dev'],
      certificate,
      comment: 'Distribution for getting assets',
      defaultRootObject: 'index.html',
      defaultBehavior: {
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        origin: new S3Origin(destinationBucket, { originId: destinationBucket.bucketRegionalDomainName })
      },
      httpVersion: HttpVersion.HTTP2_AND_3,
      logBucket: logsBucket,
      priceClass: PriceClass.PRICE_CLASS_200,
      logFilePrefix: 'stelo.dev/cdn/',
      errorResponses: [{ responseHttpStatus: 200, responsePagePath: '/index.html', httpStatus: 403 }],
      geoRestriction: GeoRestriction.denylist('CU', 'IR', 'KP', 'SY', 'UA', 'CN', 'PK')
    });

    new ARecord(this, 'AssetsAlias', {
      deleteExisting: true,
      recordName: hostedZone.zoneName,
      zone: hostedZone,
      comment: 'Routes traffic to assets distribution',
      target: RecordTarget.fromAlias(new CloudFrontTarget(distro))
    });

    NagSuppressions.addResourceSuppressions(distro, [{ id: 'AwsSolutions-CFR2', reason: 'WAF protection is expensive' }]);
    distro.node.findChild('Origin1').node.tryRemoveChild('S3Origin');
    (distro.node.defaultChild as CfnResource).addPropertyOverride('DistributionConfig.Origins.0.S3OriginConfig.OriginAccessIdentity', '');
    (distro.node.defaultChild as CfnResource).addPropertyOverride('DistributionConfig.Origins.0.OriginAccessControlId', oac.attrId);
    destinationBucket.addToResourcePolicy(
      new PolicyStatement({
        principals: [new ServicePrincipal(regionInfo.servicePrincipal('cloudfront.amazonaws.com') ?? '')],
        actions: ['s3:GetObject'],
        resources: [destinationBucket.arnForObjects('*')],
        effect: Effect.ALLOW,
        conditions: { StringEquals: { 'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${distro.distributionId}` } }
      })
    );
    (destinationBucket.policy?.node.defaultChild as CfnResource).addPropertyDeletionOverride('PolicyDocument.Statement.3');
  }
}

export class SteloWebCDNStage extends Stage {
  constructor(scope: Construct, props: Omit<StageProps, 'stageName'>) {
    super(scope, 'CDN', { stageName: 'stelo-web-cdn', ...props });
    new SteloWebCDNStack(this, props);
  }
}
