import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';

import { SteloWebPipelineStack } from '../../src/stack/pipeline';

describe('SteloWebPipelineStack', () => {
  let stack: SteloWebPipelineStack;
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
    stack = new SteloWebPipelineStack(app, { env: { account: '0123456789', region: 'us-west-2' } });
  });

  class SteloWebPipelineTemplate {
    private template: Template;

    constructor(stack: SteloWebPipelineStack) {
      this.template = Template.fromStack(stack);
    }

    public hasPipelineResources = () => {
      this.template.hasResourceProperties('AWS::Logs::LogGroup', { LogGroupName: '/aws/codebuild/stelo-web-synth', RetentionInDays: 180 });
      this.template.hasResourceProperties('AWS::Logs::LogGroup', { LogGroupName: '/aws/codebuild/stelo-web-mutate', RetentionInDays: 180 });
      this.template.hasResourceProperties('AWS::Logs::LogGroup', { LogGroupName: '/aws/codebuild/stelo-web-assets', RetentionInDays: 180 });
      this.template.hasResourceProperties('AWS::CodePipeline::Pipeline', { Name: 'stelo-web', RestartExecutionOnUpdate: true });
      this.template.hasResourceProperties('AWS::CodeBuild::Project', {
        Artifacts: { Type: 'CODEPIPELINE' },
        Cache: { Type: 'NO_CACHE' },
        Environment: {
          ComputeType: 'BUILD_GENERAL1_SMALL',
          Image: 'aws/codebuild/amazonlinux2-aarch64-standard:3.0',
          ImagePullCredentialsType: 'CODEBUILD',
          PrivilegedMode: false,
          Type: 'ARM_CONTAINER'
        },
        Description: Match.stringLikeRegexp('.*Synth.*')
      });
      this.template.hasResourceProperties('AWS::CodeBuild::Project', {
        Artifacts: { Type: 'CODEPIPELINE' },
        Cache: { Type: 'NO_CACHE' },
        Environment: {
          ComputeType: 'BUILD_GENERAL1_SMALL',
          Image: 'aws/codebuild/amazonlinux2-aarch64-standard:3.0',
          ImagePullCredentialsType: 'CODEBUILD',
          PrivilegedMode: false,
          Type: 'ARM_CONTAINER'
        },
        Description: Match.stringLikeRegexp('.*SelfMutate.*'),
        Name: 'stelo-web-selfupdate'
      });
    };
  }

  it('expect resources to be generated', () => {
    const template = new SteloWebPipelineTemplate(stack);

    template.hasPipelineResources();
  });
});
