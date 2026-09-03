import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env, r2Configurado } from '../env.js';

let client: S3Client | null = null;

function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return client;
}

export function r2Pronto(): boolean {
  return r2Configurado;
}

export interface UrlUpload {
  uploadUrl: string;
  publicUrl: string;
  metodo: 'PUT';
  expiraEmSegundos: number;
}

/** URL PUT pré-assinada (5 min) + a URL pública final do objeto. */
export async function gerarUrlUpload(chave: string, contentType: string): Promise<UrlUpload> {
  const cmd = new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: chave,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(s3(), cmd, { expiresIn: 300 });
  return {
    uploadUrl,
    publicUrl: `${env.R2_PUBLIC_URL!.replace(/\/$/, '')}/${chave}`,
    metodo: 'PUT',
    expiraEmSegundos: 300,
  };
}
