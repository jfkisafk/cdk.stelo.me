import { App } from 'aws-cdk-lib';

import { SteloWebPipelineStack } from '../src/stack/pipeline';

const app = new App();
new SteloWebPipelineStack(app, { env: { account: process.env.STELO_STIE_ACCOUNT, region: 'us-east-1' } });
app.synth();
