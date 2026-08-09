declare module "opencc-js/t2cn" {
  export interface ConverterOptions {
    from: "cn" | "t" | "tw" | "twp" | "hk" | "jp";
    to: "cn" | "t" | "tw" | "twp" | "hk" | "jp";
  }
  export function Converter(options: ConverterOptions): (text: string) => string;
}
