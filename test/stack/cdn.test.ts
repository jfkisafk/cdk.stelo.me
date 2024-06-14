import { App } from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import { Fact, FactName } from 'aws-cdk-lib/region-info';

import { SteloWebCDNStack } from '../../src/stack/cdn';

describe('SteloWebCDNStack', () => {
  let stack: SteloWebCDNStack;
  beforeAll(() => {
    const app = new App({
      context: {
        '@aws-cdk/aws-lambda:recognizeLayerVersion': true,
        '@aws-cdk/core:checkSecretUsage': true,
        '@aws-cdk/core:target-partitions': ['aws', 'aws-cn'],
        '@aws-cdk-containers/ecs-service-extensions:enableDefaultLogDriver': true,
        '@aws-cdk/aws-ec2:uniqueImdsv2TemplateName': true,
        '@aws-cdk/aws-ecs:arnFormatIncludesClusterName': true,
        '@aws-cdk/aws-iam:minimizePolicies': true,
        '@aws-cdk/core:validateSnapshotRemovalPolicy': true,
        '@aws-cdk/aws-codepipeline:crossAccountKeyAliasStackSafeResourceName': true,
        '@aws-cdk/aws-s3:createDefaultLoggingPolicy': true,
        '@aws-cdk/aws-sns-subscriptions:restrictSqsDescryption': true,
        '@aws-cdk/aws-apigateway:disableCloudWatchRole': true,
        '@aws-cdk/core:enablePartitionLiterals': true,
        '@aws-cdk/aws-events:eventsTargetQueueSameAccount': true,
        '@aws-cdk/aws-iam:standardizedServicePrincipals': true,
        '@aws-cdk/aws-ecs:disableExplicitDeploymentControllerForCircuitBreaker': true,
        '@aws-cdk/aws-iam:importedRoleStackSafeDefaultPolicyName': true,
        '@aws-cdk/aws-s3:serverAccessLogsUseBucketPolicy': true,
        '@aws-cdk/aws-route53-patters:useCertificate': true,
        '@aws-cdk/customresources:installLatestAwsSdkDefault': false,
        '@aws-cdk/aws-rds:databaseProxyUniqueResourceName': true,
        '@aws-cdk/aws-codedeploy:removeAlarmsFromDeploymentGroup': true,
        '@aws-cdk/aws-apigateway:authorizerChangeDeploymentLogicalId': true,
        '@aws-cdk/aws-ec2:launchTemplateDefaultUserData': true,
        '@aws-cdk/aws-secretsmanager:useAttachedSecretResourcePolicyForSecretTargetAttachments': true,
        '@aws-cdk/aws-redshift:columnId': true,
        '@aws-cdk/aws-stepfunctions-tasks:enableEmrServicePolicyV2': true,
        '@aws-cdk/aws-ec2:restrictDefaultSecurityGroup': true,
        '@aws-cdk/aws-apigateway:requestValidatorUniqueId': true,
        '@aws-cdk/aws-kms:aliasNameRef': true,
        '@aws-cdk/aws-autoscaling:generateLaunchTemplateInsteadOfLaunchConfig': true,
        '@aws-cdk/core:includePrefixInUniqueNameGeneration': true,
        '@aws-cdk/aws-efs:denyAnonymousAccess': true,
        '@aws-cdk/aws-opensearchservice:enableOpensearchMultiAzWithStandby': true,
        '@aws-cdk/aws-lambda-nodejs:useLatestRuntimeVersion': true,
        '@aws-cdk/aws-efs:mountTargetOrderInsensitiveLogicalId': true,
        '@aws-cdk/aws-rds:auroraClusterChangeScopeOfInstanceParameterGroupWithEachParameters': true,
        '@aws-cdk/aws-appsync:useArnForSourceApiAssociationIdentifier': true,
        '@aws-cdk/aws-rds:preventRenderingDeprecatedCredentials': true,
        '@aws-cdk/aws-codepipeline-actions:useNewDefaultBranchForCodeCommitSource': true,
        '@aws-cdk/aws-cloudfront:defaultSecurityPolicyTLSv1.2_2021': true
      }
    });
    ['delivery.logs.amazonaws.com', 'cloudfront.amazonaws.com'].map(sp =>
      Fact.register({ region: 'us-east-1', name: FactName.servicePrincipal(sp), value: sp })
    );
    stack = new SteloWebCDNStack(app, { env: { account: '0123456789', region: 'us-east-1' } });
  });

  class SteloWebCDNTemplate {
    private template: Template;

    constructor(stack: SteloWebCDNStack) {
      this.template = Template.fromStack(stack);
    }

    public hasBuckets = () => {
      this.template.hasResourceProperties('AWS::KMS::Key', { EnableKeyRotation: true, Enabled: true });
      this.template.hasResourceProperties('AWS::KMS::Alias', { AliasName: 'alias/stelo/web' });
      this.template.hasResourceProperties('AWS::S3::Bucket', {
        AccessControl: 'LogDeliveryWrite',
        BucketName: 'access.logs.stelo.dev',
        OwnershipControls: { Rules: [{ ObjectOwnership: 'ObjectWriter' }] }
      });
      this.template.hasResourceProperties('AWS::S3::BucketPolicy', { Bucket: { Ref: Match.stringLikeRegexp('LogsBucket.+') } });
      this.template.resourceCountIs('Custom::S3AutoDeleteObjects', 2);
      this.template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'stelo.dev',
        LoggingConfiguration: { DestinationBucketName: { Ref: Match.stringLikeRegexp('LogsBucket.+') }, LogFilePrefix: 'stelo.dev/bucket/' }
      });
      this.template.hasResourceProperties('AWS::S3::BucketPolicy', { Bucket: { Ref: Match.stringLikeRegexp('AssetsBucket.+') } });
      this.template.hasResourceProperties('AWS::Lambda::LayerVersion', { Description: '/opt/awscli/aws' });
      this.template.hasResource('Custom::CDKBucketDeployment', {
        Properties: Match.objectLike({ Prune: true }),
        DependsOn: [Match.stringLikeRegexp('AssetsDeploymentFunctionLogs.+')]
      });
      this.template.hasResourceProperties('AWS::IAM::Role', { RoleName: 'stelo-web-assets-deployment-role' });
      this.template.hasResourceProperties('AWS::Lambda::Function', { FunctionName: 'stelo-web-assets-deployment', Runtime: 'python3.12' });
      this.template.hasResourceProperties('AWS::Logs::LogGroup', { LogGroupName: '/aws/lambda/stelo-web-assets-deployment' });
    };

    public hasDistribution = () => {
      this.template.hasResourceProperties('AWS::Route53::HostedZone', { Name: 'cdn.stelo.dev.' });
      this.template.hasResourceProperties('AWS::CertificateManager::Certificate', {
        DomainName: 'cdn.stelo.dev',
        ValidationMethod: 'DNS'
      });
      this.template.hasResourceProperties('AWS::Route53::RecordSet', {
        Name: 'cdn.stelo.dev.',
        ResourceRecords: ['0 issue "amazon.com"'],
        TTL: '1800',
        Type: 'CAA'
      });
      this.template.hasResourceProperties('AWS::Route53::RecordSet', { Name: 'cdn.stelo.dev.', Type: 'A' });
      this.template.hasResourceProperties('AWS::CloudFront::OriginAccessControl', {
        OriginAccessControlConfig: Match.objectLike({ OriginAccessControlOriginType: 's3', SigningBehavior: 'always', SigningProtocol: 'sigv4' })
      });
      this.template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: Match.objectLike({
          Aliases: ['cdn.stelo.dev'],
          CustomErrorResponses: [{ ErrorCode: 403, ResponseCode: 200, ResponsePagePath: '/index.html' }],
          DefaultCacheBehavior: Match.objectLike({
            Compress: true,
            ViewerProtocolPolicy: 'redirect-to-https',
            CachedMethods: ['GET', 'HEAD', 'OPTIONS'],
            AllowedMethods: ['GET', 'HEAD', 'OPTIONS']
          }),
          DefaultRootObject: 'index.html',
          Enabled: true,
          HttpVersion: 'http2and3',
          IPV6Enabled: true,
          PriceClass: 'PriceClass_200',
          Restrictions: { GeoRestriction: { Locations: ['CU', 'IR', 'KP', 'SY', 'UA', 'CN', 'PK'], RestrictionType: 'blacklist' } },
          ViewerCertificate: Match.objectLike({ MinimumProtocolVersion: 'TLSv1.2_2021', SslSupportMethod: 'sni-only' }),
          Origins: [Match.objectLike({ OriginAccessControlId: { 'Fn::GetAtt': ['OriginAccessControl', 'Id'] }, S3OriginConfig: { OriginAccessIdentity: '' } })]
        })
      });
      this.template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
        ResponseHeadersPolicyConfig: {
          Comment: 'Adds CORS and security headers',
          CorsConfig: {
            AccessControlAllowCredentials: false,
            AccessControlAllowHeaders: { Items: ['*'] },
            AccessControlAllowMethods: { Items: ['GET', 'HEAD'] },
            AccessControlAllowOrigins: { Items: ['stelo.info', 'stelo.app', 'stelo.dev', 'stelo.me'].flatMap(o => [`https://${o}`, `http://*.${o}`]) },
            AccessControlMaxAgeSec: 3600,
            OriginOverride: true
          },
          Name: 'stelo-cdn-cors',
          SecurityHeadersConfig: {
            ContentTypeOptions: { Override: true },
            FrameOptions: { FrameOption: 'SAMEORIGIN', Override: true },
            ReferrerPolicy: { Override: true, ReferrerPolicy: 'strict-origin-when-cross-origin' },
            StrictTransportSecurity: { AccessControlMaxAgeSec: 31536000, IncludeSubdomains: true, Override: true },
            XSSProtection: { ModeBlock: true, Override: true, Protection: true }
          }
        }
      });
    };
  }

  it('expect resources to be generated', () => {
    const template = new SteloWebCDNTemplate(stack);
    const annotations = Annotations.fromStack(stack);
    expect(annotations.findWarning('*', Match.stringLikeRegexp('AwsSolutions-.*'))).toHaveLength(0);
    expect(annotations.findError('*', Match.stringLikeRegexp('AwsSolutions-.*'))).toHaveLength(0);

    template.hasBuckets();
    template.hasDistribution();
  });
});
