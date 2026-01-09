import aws from "aws-sdk";
import streamifier from "streamifier";

const s3Config = new aws.S3({
	// useAccelerateEndpoint: true,
	accessKeyId: process.env.AWS_IAM_USER_KEY,
	secretAccessKey: process.env.AWS_IAM_USER_SECRET,
	Bucket: process.env.AWS_BUCKET_NAME,
	region: process.env.AWS_BUCKET_REGION,
});

export function uploadBlobToS3(blob, key) {
	return new Promise((resolve, reject) => {
		// Remove the prefix 'data:audio/webm;codecs=opus;base64,'
		const prefixLength = "data:audio/wav;base64,".length;

		const base64Data = blob[0].substring(prefixLength);

		// Convert base64 to a Buffer
		const buffer = Buffer.from(base64Data, "base64");

		const params = {
			Bucket: process.env.AWS_BUCKET_NAME,
			Key: key,
			Body: streamifier.createReadStream(buffer), // Convert Buffer to readable stream
			ACL: "public-read",
			ContentType: "audio/wav",
		};

		// const startTime = performance.now();

		s3Config.upload(params, (err, data) => {
			if (err) {
				reject(err);
			} else {
				resolve(data);
			}
		});
	});
}
