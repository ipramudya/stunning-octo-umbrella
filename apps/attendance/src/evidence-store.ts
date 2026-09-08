import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client, CopyDestinationOptions, CopySourceOptions } from "minio";
import type { Environment } from "./config.schema.js";

function client(endpoint: string, accessKey: string, secretKey: string) {
  const url = new URL(endpoint);
  return new Client({
    endPoint: url.hostname,
    port: url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80,
    useSSL: url.protocol === "https:",
    region: "us-east-1",
    accessKey,
    secretKey,
  });
}

@Injectable()
export class EvidenceStore implements OnModuleInit {
  readonly bucket: string;
  private readonly internal: Client;
  private readonly public: Client;

  constructor(config: ConfigService<Environment, true>) {
    const accessKey = config.get("MINIO_ACCESS_KEY", { infer: true });
    const secretKey = config.get("MINIO_SECRET_KEY", { infer: true });
    this.bucket = config.get("MINIO_EVIDENCE_BUCKET", { infer: true });
    this.internal = client(config.get("MINIO_ENDPOINT", { infer: true }), accessKey, secretKey);
    this.public = client(
      config.get("MINIO_PUBLIC_ENDPOINT", { infer: true }),
      accessKey,
      secretKey,
    );
  }

  async onModuleInit() {
    if (!(await this.internal.bucketExists(this.bucket)))
      await this.internal.makeBucket(this.bucket);
    await this.internal.setBucketVersioning(this.bucket, { Status: "Enabled" });
    await this.internal.setBucketLifecycle(this.bucket, {
      Rule: [
        {
          ID: "expire-staging-evidence",
          Status: "Enabled",
          Filter: { Prefix: "staging/" },
          Expiration: { Days: 1 },
          NoncurrentVersionExpiration: { NoncurrentDays: 1 },
          AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
        },
      ],
    });
  }

  authorizeUpload(key: string, expiresSeconds: number) {
    return this.public.presignedPutObject(this.bucket, key, expiresSeconds);
  }

  authorizeAccess(key: string, versionId: string, expiresSeconds: number) {
    return this.public.presignedUrl("GET", this.bucket, key, expiresSeconds, { versionId });
  }

  stat(key: string, versionId?: string) {
    return this.internal.statObject(this.bucket, key, versionId ? { versionId } : undefined);
  }

  async magic(key: string, versionId: string) {
    const stream = await this.internal.getObject(this.bucket, key, { versionId });
    for await (const chunk of stream) {
      stream.destroy();
      return Buffer.from(chunk as Buffer).subarray(0, 8);
    }
    return Buffer.alloc(0);
  }

  copy(stagingKey: string, stagingVersion: string, permanentKey: string) {
    return this.internal.copyObject(
      new CopySourceOptions({
        Bucket: this.bucket,
        Object: stagingKey,
        VersionID: stagingVersion,
      }),
      new CopyDestinationOptions({ Bucket: this.bucket, Object: permanentKey }),
    );
  }

  remove(key: string, versionId?: string) {
    return this.internal.removeObject(this.bucket, key, versionId ? { versionId } : undefined);
  }
}
