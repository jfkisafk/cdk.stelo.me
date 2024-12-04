import { Aspects, Duration, RemovalPolicy, Stack, StackProps, Stage, StageProps, Tags } from 'aws-cdk-lib';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import {
  AllowedMethods,
  CachedMethods,
  Distribution,
  GeoRestriction, 
  HeadersFrameOption, 
  HeadersReferrerPolicy,
  HttpVersion,
  PriceClass,
  ResponseHeadersPolicy, 
  S3OriginAccessControl,
  ViewerProtocolPolicy
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { AccountRootPrincipal, CfnRole, CompositePrincipal, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { CfnFunction } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { ARecord, PublicHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { BlockPublicAccess, Bucket, BucketAccessControl, ObjectOwnership, StorageClass } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
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
          sp => new ServicePrincipal(ServicePrincipal.servicePrincipalName(sp))
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
    deploymentFn.addPropertyOverride('Runtime', 'python3.12');
    deploymentFn.addPropertyOverride('FunctionName', 'stelo-web-assets-deployment');
    const deploymentFnLogs = new LogGroup(this, 'AssetsDeploymentFunctionLogs', {
      logGroupName: `/aws/lambda/${deploymentFn.ref}`,
      removalPolicy: RemovalPolicy.DESTROY,
      retention: RetentionDays.TWO_MONTHS,
      encryptionKey
    });
    bucketDeployment.node.findChild('CustomResource').node.addDependency(deploymentFnLogs);
    NagSuppressions.addResourceSuppressions(deploymentFn, [{ id: 'AwsSolutions-L1', reason: 'Through escape hatch' }]);

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

    const distro = new Distribution(this, 'AssetsDistro', {
      domainNames: ['cdn.stelo.dev'],
      certificate,
      comment: 'Distribution for getting assets',
      defaultRootObject: 'index.html',
      defaultBehavior: {
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        origin: S3BucketOrigin.withOriginAccessControl(destinationBucket, { originAccessControl: new S3OriginAccessControl(this, 'OriginAccessControl', { description: 'sigv4 for stelo.dev origin bucket', originAccessControlName: destinationBucket.bucketName }) }),
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: CachedMethods.CACHE_GET_HEAD_OPTIONS,
        responseHeadersPolicy: new ResponseHeadersPolicy(this, 'AssetsResponseHeadersPolicy', {
          responseHeadersPolicyName: 'stelo-cdn-cors',
          comment: 'Adds CORS and security headers',
          removeHeaders: ['etag', 'server', 'x-amz-server-side-encryption', 'x-amz-server-side-encryption-aws-kms-key-id'],
          corsBehavior: {
            accessControlAllowOrigins: ['stelo.info', 'stelo.app', 'stelo.dev', 'stelo.me'].flatMap(o => [`https://${o}`, `https://*.${o}`]),
            accessControlAllowHeaders: ['*'],
            accessControlMaxAge: Duration.hours(1),
            accessControlAllowMethods: ['GET', 'HEAD'],
            originOverride: true,
            accessControlAllowCredentials: false
          },
          securityHeadersBehavior: {
            contentSecurityPolicy: { override: true, contentSecurityPolicy: `${["default-src 'self'", ...(['stelo.info', 'stelo.app', 'stelo.dev', 'stelo.me'].flatMap(o => [`https://${o}`, `https://*.${o}`]))].join(' ')};` },
            contentTypeOptions: { override: true },
            frameOptions: { frameOption: HeadersFrameOption.SAMEORIGIN, override: true },
            referrerPolicy: { referrerPolicy: HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN, override: true },
            strictTransportSecurity: { accessControlMaxAge: Duration.days(365), includeSubdomains: true, override: true },
            xssProtection: { protection: true, modeBlock: true, override: true },
          }
        })
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
  }
}

export class SteloWebCDNStage extends Stage {
  constructor(scope: Construct, props: Omit<StageProps, 'stageName'>) {
    super(scope, 'CDN', { stageName: 'stelo-web-cdn', ...props });
    new SteloWebCDNStack(this, props);
  }
}
