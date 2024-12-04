import { RemovalPolicy, Stack, StackProps, Tags } from 'aws-cdk-lib';
import { ComputeType, LinuxArmBuildImage } from 'aws-cdk-lib/aws-codebuild';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { CodePipeline, CodePipelineSource, ShellStep } from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';

import { SteloWebCDNStage } from './cdn';

export class SteloWebPipelineStack extends Stack {
  constructor(scope: Construct, props: Omit<StackProps, 'description' | 'stackName' | 'terminationProtection'>) {
    super(scope, 'Pipeline', {
      stackName: 'stelo-web-pipeline',
      description: 'Stack to manage Stelo websites pipeline',
      terminationProtection: true,
      ...props
    });

    Tags.of(this).add('stelo:app', 'website');
    Tags.of(this).add('stelo:website:entity', 'pipeline');
    const { account } = this;

    const connectionArn = process.env.STELO_SITE_GIT_CONN_ARN ?? 'connectionArn';
    const environmentVariables = {
      STELO_SITE_GIT_CONN_ARN: { value: connectionArn },
      STELO_SITE_ACCOUNT: { value: account }
    };

    const pipeline = new CodePipeline(this, 'CodePipeline', {
      pipelineName: 'stelo-web',
      reuseCrossRegionSupportStacks: true,
      crossAccountKeys: true,
      selfMutation: true,
      enableKeyRotation: true,
      publishAssetsInParallel: false,
      useChangeSets: true,
      codeBuildDefaults: {
        buildEnvironment: { buildImage: LinuxArmBuildImage.AMAZON_LINUX_2_STANDARD_3_0, computeType: ComputeType.SMALL, environmentVariables }
      },
      synthCodeBuildDefaults: {
        logging: {
          cloudWatch: {
            logGroup: new LogGroup(this, 'SynthCodeBuildLogGroup', {
              logGroupName: '/aws/codebuild/stelo-web-synth',
              retention: RetentionDays.SIX_MONTHS,
              removalPolicy: RemovalPolicy.DESTROY
            })
          }
        }
      },
      selfMutationCodeBuildDefaults: {
        logging: {
          cloudWatch: {
            logGroup: new LogGroup(this, 'SelfMutateCodeBuildLogGroup', {
              logGroupName: '/aws/codebuild/stelo-web-mutate',
              retention: RetentionDays.SIX_MONTHS,
              removalPolicy: RemovalPolicy.DESTROY
            })
          }
        }
      },
      assetPublishingCodeBuildDefaults: {
        logging: {
          cloudWatch: {
            logGroup: new LogGroup(this, 'AssetsCodeBuildLogGroup', {
              logGroupName: '/aws/codebuild/stelo-web-assets',
              retention: RetentionDays.SIX_MONTHS,
              removalPolicy: RemovalPolicy.DESTROY
            })
          }
        }
      },
      synth: new ShellStep('Synth', {
        input: CodePipelineSource.connection('jfkisafk/cdk.stelo.me', 'main', { connectionArn, codeBuildCloneOutput: true, actionName: 'cdk.stelo.me' }),
        additionalInputs: {
          '../cdn': CodePipelineSource.connection('jfkisafk/stelo.cdn', 'main', { connectionArn, codeBuildCloneOutput: true, actionName: 'stelo.cdn' })
        },
        commands: ['npm ci', 'npm run build', 'npx cdk synth']
      })
    });

    const wave = pipeline.addWave('Global');
    wave.addStage(new SteloWebCDNStage(this, props));
  }
}
