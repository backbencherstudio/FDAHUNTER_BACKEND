import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
    user?: {
      id: string;
      type?: string;
      [key: string]: any;
    };
    file?: {
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      destination: string;
      filename: string;
      path: string;
      size: number;
    };
  }
}


