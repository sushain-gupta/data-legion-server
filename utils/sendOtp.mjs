import axios from "axios";

// Send OTP via Fast2SMS API
export default async function sendOtpViaFast2SMS(mobile, otp) {
	const url = "https://www.fast2sms.com/dev/bulkV2";

	const params = new URLSearchParams();
	params.append("authorization", process.env.FAST2SMS_API_KEY);
	params.append("route", "otp");
	params.append("numbers", mobile);
	params.append("variables_values", otp);

	try {
		const response = await axios.get(url, { params });
		return response.data;
	} catch (error) {
		throw error;
	}
}

// Send OTP via Fast2SMS API
export async function sendOtpViaWa(mobile, otp) {
	const PHONE_NUMBER_ID = process.env.WABA_PID;
	const ACCESS_TOKEN = process.env.WABA_ACCESS_TOKEN;

	const url = `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;

	const payload = {
		messaging_product: "whatsapp",
		recipient_type: "individual",
		to: `91${mobile}`,
		type: "template",
		template: {
			name: "otp",
			language: { code: "en" },
			components: [
				{
					type: "body",
					parameters: [
						{
							type: "text",
							text: otp,
						},
					],
				},
				{
					type: "button",
					sub_type: "url",
					index: "0",
					parameters: [
						{
							type: "text",
							text: otp,
						},
					],
				},
			],
		},
	};

	try {
		const response = await axios.post(url, payload, {
			headers: {
				Authorization: `Bearer ${ACCESS_TOKEN}`,
				"Content-Type": "application/json",
			},
		});

		console.log("Message sent:", response.data);
	} catch (error) {
		console.error(
			"Error sending message:",
			error.response?.data || error.message
		);
	}
}