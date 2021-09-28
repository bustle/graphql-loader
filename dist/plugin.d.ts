import { WebpackPluginInstance, Compiler } from 'webpack';
interface GraphQLLoaderPluginOptions {
    manifestFilename?: string;
}
export default class GraphQLLoaderPlugin implements WebpackPluginInstance {
    private manifestFilename;
    constructor(options?: GraphQLLoaderPluginOptions);
    apply(compiler: Compiler): void;
}
export {};
