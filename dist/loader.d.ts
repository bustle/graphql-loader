import { LoaderContext } from 'webpack';
interface LoaderOptions {
    schema?: string;
    validate?: boolean;
    output?: 'string' | 'document';
    removeUnusedFragments?: boolean;
    minify?: boolean;
    hash?: boolean | 'replace';
    hashFunction?: (query: string) => string;
}
export declare const hashedQueryMapKey = "__graphql-loader-hashed-query-map__";
export default function loader(this: LoaderContext<LoaderOptions>, source: string): Promise<void>;
export {};
