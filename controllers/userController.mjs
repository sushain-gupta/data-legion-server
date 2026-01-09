import asyncErrorHandler from "../middlewares/asyncErrorHandler.mjs";
import sendToken from "../utils/sendToken.mjs";
import ErrorHandler from "../utils/errorHandler.mjs";
import xlsx from "xlsx";
import {
	BasicSurveyAgent,
	SuperAdmin,
	SurveyAdmin,
	User,
	VoterAdmin,
	VoterSurveyAgent,
} from "../models/userModel.mjs";
import { sendOtpViaWa } from "../utils/sendOtp.mjs";
import { Survey } from "../models/surveyModel.mjs";
import { Voter } from "../models/voterModel.mjs";
// import mongoose from "mongoose";

// Add bulk users
export const addBulkUsers = asyncErrorHandler(async (req, res, next) => {
	// Parse the Excel file
	const workbook = xlsx.readFile(req.file.path);
	const worksheet = workbook.Sheets[workbook.SheetNames[0]];
	const data = xlsx.utils.sheet_to_json(worksheet);

	if (data.length === 0) {
		return next(new ErrorHandler("No Data Found", 400));
	}

	const users = await Promise.all(
		data.map(async (row) => {
			// check if mobile exists, if yes, update the user
			const user = await User.findOne({ mobile: row.mobile });

			if (user) {
				user.name = row.name;
				user.role = row.role;
				user.constituencyCode = row["constituencyCode"];
				await user.save();

				return `${row.mobile} already exists`;
			} else {
				// create a new user
				const user = await User.create({
					name: row.name,
					mobile: row.mobile,
					role: row.role,
					constituencyCode: row["constituencyCode"],
				});

				if (!user) {
					throw new ErrorHandler("Something Went Wrong", 500);
				}

				return user;
			}
		})
	);

	res.status(200).json({
		success: true,
		message: "Users Added Successfully",
		users,
	});
});

// Add bulk users
export const addUser = asyncErrorHandler(async (req, res, next) => {
	// check if mobile exists, if yes, update the user
	const userToAdd = req.body.userToAdd;
	var Schema = User;

	let user = await User.findOne({
		mobile: userToAdd.mobile,
	});

	// if (user) {
	// 	return next(new ErrorHandler("User Already Exist", 400));
	// }

	if (userToAdd.role === "superAdmin") Schema = SuperAdmin;

	if (user) {
		user.name = userToAdd.name;
		user.role = userToAdd.role;
		user.constituencyCode = userToAdd.constituencyCode;
		await user.save();
	} else {
		// create a new user
		user = await Schema.create({
			name: userToAdd.name,
			mobile: userToAdd.mobile,
			role: userToAdd.role,
			constituencyCode: userToAdd.constituencyCode,
		});

		if (!user) {
			throw new ErrorHandler("Something Went Wrong", 500);
		}
	}

	res.status(200).json({
		success: true,
		message: "User Added",
		user,
	});
});

// Remove User
export const removeUser = asyncErrorHandler(async (req, res, next) => {
	const userId = req.query.id;
	const Schema = User;

	const removedUser = await Schema.findByIdAndDelete(userId);

	if (removedUser) {
		const relevantUsers = await User.find({ role: removedUser.role }).sort({
			createdAt: -1,
		});

		res.status(200).json({
			success: true,
			message: "User removed successfully",
			removedUser,
			relevantUsers,
		});
	} else {
		return next(new ErrorHandler("User does not exist", 400));
	}
});

// Add Admin
export const addAdmin = asyncErrorHandler(async (req, res, next) => {
	// check if mobile exists, if yes, update the user
	const adminToAdd = req.body.data;
	const Schema = req.user.surveyType === "voter" ? VoterAdmin : SurveyAdmin;

	let admin = await User.findOne({
		mobile: adminToAdd.mobile,
	});

	if (admin) {
		return next(new ErrorHandler("Admin Already Exists", 400));
	} else {
		// create a new user
		admin = await Schema.create({
			...adminToAdd,
			constituencyCode: adminToAdd.assigned.constituencies[0],
		});
	}

	if (!admin) {
		return next(new ErrorHandler("Something Went Wrong", 500));
	}

	admin = await Schema.findById(admin._id)
		.select("name mobile assigned constituencyCode role createdAt")
		.lean();

	res.status(200).json({
		success: true,
		message: "Admin Added",
		admin,
	});
});

// Edit Admin
export const editAdmin = asyncErrorHandler(async (req, res, next) => {
	const dataToUpdate = req.body.data;

	const Schema = req.user.surveyType === "voter" ? VoterAdmin : SurveyAdmin;

	let admin = await Schema.findById(dataToUpdate.id).select(
		"name mobile assigned constituencyCode role createdAt"
	);

	if (admin) {
		admin.name = dataToUpdate.name;
		admin.mobile = dataToUpdate.mobile;
		admin.assigned = dataToUpdate.assigned;

		await admin.save();
	} else {
		return next(new ErrorHandler("Admin does not exist", 400));
	}

	const admins = await Schema.find()
		.sort({ createdAt: -1 })
		.select("name mobile assigned constituencyCode role createdAt");

	res.status(200).json({
		success: true,
		message: "Admin Details Updated",
		admins,
		admin,
	});
});

// Add Admin
export const getAdmins = asyncErrorHandler(async (req, res, next) => {
	var admins;

	try {
		// check if mobile exists, if yes, update the user
		const Schema = req.user.surveyType === "voter" ? VoterAdmin : SurveyAdmin;

		admins = await Schema.find()
			.sort({ createdAt: -1 })
			.select("name mobile assigned constituencyCode role createdAt");

		if (!admins) {
			return next(new ErrorHandler(`Something went wrong`, 500));
		}
	} catch (err) {
		return next(new ErrorHandler(err, 400));
	}

	res.status(200).json({
		success: true,
		message: "Admins fetched successfully",
		admins,
	});
});

// Add Agent
export const addAgent = asyncErrorHandler(async (req, res, next) => {
	// check if mobile exists, if yes, update the user
	try {
		const agentToAdd = req.body.data;

		var Schema =
			req.user.role === "voterAdmin" ? VoterSurveyAgent : BasicSurveyAgent;

		var agent = await User.findOne({
			mobile: agentToAdd.mobile,
		});

		if (agent) return next(new ErrorHandler("Agent Already Exists", 400));

		// create a new agent
		agent = await Schema.create({
			...agentToAdd,
			constituencyCode: req.user.constituencyCode,
		});

		if (!agent) return next(new ErrorHandler("Something Went Wrong", 500));

		if (req.user.role === "voterAdmin") {
			const sectionsAssigned = agent.assigned?.sections?.map((section) => {
				const [sectionNumber, _] = section.split(" - ");
				return sectionNumber;
			});

			await Voter.updateMany(
				{
					acNumber: agent.constituencyCode,
					pollingStation: { $in: agent.assigned.pollingStations },
					...(sectionsAssigned?.length > 0 && {
						sectionNumber: { $in: sectionsAssigned },
					}),
					// surveyTaken: false,
				},
				{
					$push: { assignedTo: agent._id },
				}
			);

			agent = await Schema.aggregate([
				{
					$match: { _id: agent._id },
				},
				{
					$lookup: {
						from: "voters",
						let: { agentId: "$_id" },
						pipeline: [
							{
								$match: {
									$expr: {
										$in: ["$$agentId", "$assignedTo"],
									},
								},
							},
						],
						as: "assignedVoters",
					},
				},
				{
					$addFields: {
						totalAssigned: { $size: "$assignedVoters" },
						surveysTaken: {
							$size: {
								$filter: {
									input: "$assignedVoters",
									as: "voter",
									cond: { $eq: ["$$voter.surveyTaken", true] },
								},
							},
						},
					},
				},
				{
					$project: {
						_id: 1,
						name: 1,
						mobile: 1,
						assigned: 1,
						surveysTaken: 1,
						totalAssigned: 1,
						createdAt: 1,
					},
				},
			]);
		} else {
			agent = await Schema.aggregate([
				{
					$match: { _id: agent._id }, // Filter for the specific agent ID
				},
				{
					$lookup: {
						from: "surveys",
						localField: "_id",
						foreignField: "addedBy",
						as: "surveys",
					},
				},
				{
					$addFields: {
						surveysTaken: { $size: "$surveys" },
					},
				},
				{
					$project: {
						_id: 1,
						name: 1,
						mobile: 1,
						assigned: 1,
						surveysTaken: 1,
						createdAt: 1,
						updatedAt: 1,
					},
				},
				{
					$sort: { createdAt: -1 },
				},
			]);
		}
	} catch (err) {
		await Schema.deleteOne({ _id: agent._id });
		return next(new ErrorHandler(err, 400));
	}

	res.status(200).json({
		success: true,
		message: "Agent Added",
		agent: agent[0],
	});
});

// Edit Agent
export const editAgent = asyncErrorHandler(async (req, res, next) => {
	const dataToUpdate = req.body.data;
	const Schema =
		req.user.role === "voterAdmin" ? VoterSurveyAgent : BasicSurveyAgent;

	let agent = await Schema.findById(dataToUpdate.id).select(
		"name mobile assigned constituencyCode role createdAt"
	);

	if (agent) {
		var sectionsAssigned = agent.assigned?.sections.map((section) => {
			const [sectionNumber, _] = section.split(" - ");
			return sectionNumber;
		});

		await Voter.updateMany(
			{
				acNumber: agent.constituencyCode,
				pollingStation: { $in: agent.assigned.pollingStations },
				...(sectionsAssigned &&
					sectionsAssigned.length > 0 && {
						sectionNumber: { $in: sectionsAssigned },
					}),
				surveyTaken: false,
			},
			{
				$pull: { assignedTo: agent._id },
			}
		);

		agent.name = dataToUpdate.name;
		agent.mobile = dataToUpdate.mobile;
		agent.assigned = dataToUpdate.assigned;

		await agent.save();

		sectionsAssigned = agent.assigned?.sections.map((section) => {
			const [sectionNumber, _] = section.split(" - ");
			return sectionNumber;
		});

		await Voter.updateMany(
			{
				acNumber: agent.constituencyCode,
				pollingStation: { $in: agent.assigned.pollingStations },
				...(sectionsAssigned &&
					sectionsAssigned.length > 0 && {
						sectionNumber: { $in: sectionsAssigned },
					}),
				// surveyTaken: false,
			},
			{
				$push: { assignedTo: agent._id },
			}
		);
	} else {
		return next(new ErrorHandler("Agents do not exist", 400));
	}

	const agents = await Schema.aggregate([
		{
			$lookup: {
				from: "voters",
				let: { agentId: "$_id" },
				pipeline: [
					{
						$match: {
							$expr: {
								$in: ["$$agentId", "$assignedTo"],
							},
						},
					},
				],
				as: "assignedVoters",
			},
		},
		{
			$addFields: {
				totalAssigned: { $size: "$assignedVoters" },
				surveysTaken: {
					$size: {
						$filter: {
							input: "$assignedVoters",
							as: "voter",
							cond: { $eq: ["$$voter.surveyTaken", true] },
						},
					},
				},
			},
		},
		{
			$project: {
				_id: 1,
				name: 1,
				mobile: 1,
				assigned: 1,
				surveysTaken: 1,
				totalAssigned: 1,
				createdAt: 1,
				updatedAt: 1,
			},
		},
		{
			$sort: { createdAt: -1 },
		},
	]);

	res.status(200).json({
		success: true,
		message: "Agent Details Updated",
		agents,
		agent,
	});
});

// Get Agents
export const getAgents = asyncErrorHandler(async (req, res, next) => {
	var agents;

	try {
		// check if mobile exists, if yes, update the user
		const Schema =
			req.user.role === "voterAdmin" ? VoterSurveyAgent : BasicSurveyAgent;

		// Aggregate to get survey progress for each VoterSurveyAgent
		if (req.user.role === "voterAdmin") {
			agents = await Schema.aggregate([
				{
					$lookup: {
						from: "voters",
						let: { agentId: "$_id" },
						pipeline: [
							{
								$match: {
									$expr: {
										$in: ["$$agentId", "$assignedTo"],
									},
								},
							},
						],
						as: "assignedVoters",
					},
				},
				{
					$addFields: {
						totalAssigned: { $size: "$assignedVoters" }, // Count the total number of assigned voters
						surveysTaken: {
							$size: {
								$filter: {
									input: "$assignedVoters", // Iterate through assignedVoters array
									as: "voter",
									cond: { $eq: ["$$voter.surveyTaken", true] }, // Check if the surveyedBy field matches the agent's _id
								},
							},
						},
					},
				},
				{
					$project: {
						_id: 1,
						name: 1,
						mobile: 1,
						assigned: 1,
						surveysTaken: 1,
						totalAssigned: 1,
						createdAt: 1,
						updatedAt: 1,
					},
				},
				{
					$sort: { createdAt: -1 },
				},
			]);
		} else {
			agents = await Schema.aggregate([
				{
					$lookup: {
						from: "surveys",
						localField: "_id",
						foreignField: "addedBy",
						as: "surveys",
					},
				},
				{
					$addFields: {
						surveysTaken: { $size: "$surveys" },
					},
				},
				{
					$project: {
						_id: 1,
						name: 1,
						mobile: 1,
						assigned: 1,
						surveysTaken: 1,
						createdAt: 1,
						updatedAt: 1,
					},
				},
				{
					$sort: { createdAt: -1 },
				},
			]);
		}

		if (!agents) {
			return next(new ErrorHandler(`Something went wrong`, 500));
		}
	} catch (err) {
		return next(new ErrorHandler(err, 400));
	}

	res.status(200).json({
		success: true,
		message: "Agents fetched successfully",
		agents,
	});
});

export const removeDuplicates = asyncErrorHandler(async (req, res, next) => {
	try {
		// Find documents with duplicate name and contact
		const duplicates = await Survey.aggregate([
			{
				$group: {
					_id: { name: "$name", contact: "$contact" },
					count: { $sum: 1 },
					docs: { $push: "$_id" },
				},
			},
			{
				$match: {
					count: { $gt: 1 },
				},
			},
		]);

		// Remove duplicates
		const removedDocs = await Promise.all(
			duplicates.map((duplicate) => {
				const { docs } = duplicate;
				// Keep the first document and remove the rest
				const [_, ...restDocIds] = docs;
				return Survey.deleteMany({ _id: { $in: restDocIds } });
			})
		);

		res.status(200).json({
			success: true,
			message: "Duplicates removed successfully",
			removedDocs,
		});
	} catch (error) {
		res
			.status(500)
			.json({ error: "Internal server error", message: error.message });
	}
});

// Genrate Form Data
export const getAdminFormOptions = asyncErrorHandler(async (req, res, next) => {
	var data = {};
	const userId = req.query?.id;

	if (req.user.surveyType === "basic") {
		data.constituencies = Array.from({ length: 543 }, (_, i) =>
			(i + 1).toString()
		);
	} else {
		data.constituencies = await Voter.aggregate([
			{
				$group: {
					_id: "$acNumber",
					surveyTakenFalseExists: {
						$sum: { $cond: [{ $eq: ["$surveyTaken", false] }, 1, 0] },
					},
				},
			},
			{
				$project: {
					_id: 0,
					option: "$_id",
					available: { $gt: ["$surveyTakenFalseExists", 0] },
				},
			},
			{ $sort: { option: 1, available: 1 } }, // Sort by code
		]);

		const isNull = data.constituencies.every((obj) => obj.option === null);

		if (isNull) {
			return next(new ErrorHandler("No data Found.", 404));
		}

		const pollingStations = await Voter.aggregate([
			{
				$group: {
					_id: {
						acNumber: "$acNumber",
						pollingStation: "$pollingStation",
					},
					surveyTakenFalse: {
						$sum: { $cond: [{ $eq: ["$surveyTaken", false] }, 1, 0] },
					},
					isAssigned: {
						$max: {
							$cond: {
								if: { $gt: [{ $size: "$assignedTo" }, 0] }, // Check if assignedTo is not empty
								then: 1, // Set isAssigned to 1 if assignedTo has elements
								else: 0, // Set isAssigned to 0 if assignedTo is empty
							},
						},
					},
				},
			},
			{
				$group: {
					_id: "$_id.acNumber",
					pollingStation: {
						$push: {
							option: "$_id.pollingStation",
							available: {
								$cond: [{ $gt: ["$surveyTakenFalse", 0] }, true, false],
							},
							isAssigned: {
								$cond: [{ $eq: ["$isAssigned", 1] }, true, false],
							},
						},
					},
				},
			},
			{
				$project: {
					_id: 0,
					constituencyCode: "$_id",
					pollingStation: 1,
				},
			},
		]);

		const formattedPollingStations = {};

		pollingStations.map((item) => {
			formattedPollingStations[item.constituencyCode] = item.pollingStation;
		});

		data.pollingStations = formattedPollingStations;
	}

	const user = await User.findById(userId).select(
		"name mobile assigned constituencyCode role createdAt"
	);

	if (user) data.user = user;

	res.status(200).json({
		success: true,
		data,
	});
});

// Genrate Form Data
export const getAgentFormOptions = asyncErrorHandler(async (req, res, next) => {
	var data = {};
	const userId = req.query?.id;
	const role = req.user.role;
	const constituency = req.user.constituencyCode;
	const acsPollingStations = req.user.assigned?.pollingStations;
	const isPsEmpty = acsPollingStations && acsPollingStations.length === 0;

	const Schema = role === "voterAdmin" ? Voter : Survey;

	try {
		if (role === "voterAdmin") {
			const pollingStations = await Schema.aggregate([
				{
					$match: {
						acNumber: constituency,
						...(!isPsEmpty && {
							pollingStation: { $in: acsPollingStations },
						}),
					},
				},
				{
					$group: {
						_id: "$pollingStation",
						surveyTakenFalseExists: {
							$sum: { $cond: [{ $eq: ["$surveyTaken", false] }, 1, 0] },
						},
					},
				},
				{
					$project: {
						_id: 0,
						option: "$_id",
						available: { $gt: ["$surveyTakenFalseExists", 0] },
						// Extract numeric part from the option (assuming format is "number - text")
						numericOption: {
							$toInt: { $arrayElemAt: [{ $split: ["$_id", " -"] }, 0] },
						},
					},
				},
				{
					$sort: { numericOption: 1, available: 1 }, // Sort by extracted numeric value
				},
			]);

			const sections = await Schema.aggregate([
				{
					$match: { acNumber: constituency },
				},
				{
					$group: {
						_id: {
							pollingStation: "$pollingStation",
							sectionNumber: "$sectionNumber",
							sectionName: "$sectionName",
						},
						surveyTakenFalse: {
							$sum: { $cond: [{ $eq: ["$surveyTaken", false] }, 1, 0] },
						},
						isAssigned: {
							$max: {
								$cond: {
									if: { $gt: [{ $size: "$assignedTo" }, 0] }, // Check if assignedTo is not empty
									then: 1, // Set isAssigned to 1 if assignedTo has elements
									else: 0, // Set isAssigned to 0 if assignedTo is empty
								},
							},
						},
					},
				},
				{
					$group: {
						_id: "$_id.pollingStation",
						sections: {
							$push: {
								option: {
									$concat: ["$_id.sectionNumber", " - ", "$_id.sectionName"],
								},
								available: {
									$cond: [{ $gt: ["$surveyTakenFalse", 0] }, true, false],
								},
								isAssigned: {
									$cond: [{ $eq: ["$isAssigned", 1] }, true, false],
								},
							},
						},
					},
				},
				{
					$project: {
						_id: 0,
						pollingStation: "$_id",
						sections: 1,
					},
				},
			]);

			const formattedSections = {};

			sections.map((item) => {
				formattedSections[item.pollingStation] = item.sections;
			});

			data.pollingStations = pollingStations;
			data.sections = formattedSections;
		} else {
			data.pollingStations = Array.from({ length: 300 }, (_, i) =>
				(i + 1).toString()
			);
		}

		if (Object.keys(data).length === 0) {
			return next(new ErrorHandler("No data Found.", 404));
		}

		const user = await User.findById(userId).select(
			"name mobile assigned constituencyCode role createdAt"
		);

		if (user) data.user = user;
	} catch (err) {
		return next(new ErrorHandler(err, 500));
	}

	res.status(200).json({
		success: true,
		data,
	});
});

// Send OTP
export const sendOtp = asyncErrorHandler(async (req, res, next) => {
	const { mobile } = req.body;

	if (!mobile) {
		return next(new ErrorHandler("Please Enter Mobile No.", 400));
	}

	const user = await User.findOne({ mobile }).select("+otpDetails");

	if (!user) {
		return next(new ErrorHandler("Mobile Number Not Found", 404));
	}

	const timeLeft = user?.otpDetails?.expiry >= Date.now();

	if (timeLeft) {
		return res.status(200).json({
			success: true,
			message: "Please use your existing OTP",
		});
	}

	const otpExpiry = Date.now() + 5 * 60 * 1000; // 5 minutes from now

	if (process.env.NODE_ENV === "production") {
		const otp = Math.floor(100000 + Math.random() * 900000);

		try {
			await sendOtpViaWa(mobile, otp);

			// Store the OTP in the user's record
			user.otpDetails = {
				otp: otp,
				expiry: otpExpiry,
			};

			await user.save();

			res.status(200).json({
				success: true,
				message: "OTP Sent Successfully",
			});
		} catch (error) {
			console.error(error.response.data.message);
			return next(new ErrorHandler(error.response.data.message, 500));
		}
	} else {
		// Use a dummy OTP or don't send OTP in the development environment
		user.otpDetails = {
			otp: 123456,
			expiry: otpExpiry,
		};

		await user.save();

		res.status(200).json({
			success: true,
			message: "Dummy OTP Sent (Development Environment)",
		});
	}
});

// Verify OTP for login
export const verifyOtpForLogin = asyncErrorHandler(async (req, res, next) => {
	const { mobile, otp } = req.body;

	if (!mobile || !otp) {
		return next(new ErrorHandler("Mobile and OTP are required", 400));
	}

	try {
		const user = await User.findOne({ mobile }).select("+otpDetails");

		if (!user) {
			return next(new ErrorHandler("Mobile Number Not Found", 404));
		}

		if (user.otpDetails.otp !== otp) {
			return next(new ErrorHandler("Invalid OTP", 401));
		}

		// Remove otp from database
		user.otpDetails = undefined;
		await user.save();

		// res.cookie("test", "test", {
		// 	// httpOnly: true,
		// 	// secure: true,
		// 	sameSite: "None",
		// 	// domain: ".opensurvey.in", // Allows subdomains
		// });

		sendToken(user, 201, res);
	} catch (error) {
		console.error(error);
		return next(new ErrorHandler("Something Went Wrong", 500));
	}
});

// Logout User
export const logoutUser = asyncErrorHandler(async (req, res, next) => {
	res.cookie("token", null, {
		expires: new Date(Date.now()),
		httpOnly: true,
	});

	res.status(200).json({
		success: true,
		message: "Logged Out",
	});
});

// Get User Details
export const getUserDetails = asyncErrorHandler(async (req, res, next) => {
	const user = await User.findById(req.user.id);

	res.status(200).json({
		success: true,
		user,
	});
});

// Update User Constituency Code
export const updateUserConstituencyCode = asyncErrorHandler(
	async (req, res, next) => {
		const { constituencyCode } = req.body;

		if (!constituencyCode) {
			return res
				.status(400)
				.json({ success: false, message: "Constituency code is required." });
		}

		const user = await User.findByIdAndUpdate(
			req.user.id,
			{ constituencyCode },
			{ new: true }
		);

		if (!user) {
			return res
				.status(404)
				.json({ success: false, message: "User not found." });
		}

		res.status(200).json({
			success: true,
			constituencyCode,
		});
	}
);

// Update User Survey Type
export const updateUserSurveyType = asyncErrorHandler(
	async (req, res, next) => {
		const { type } = req.body;

		if (!type) {
			return next(new ErrorHandler("Survey Type is required.", 400));
		}

		const user = await SuperAdmin.findByIdAndUpdate(
			req.user.id,
			{ surveyType: type },
			{ new: true }
		);

		if (!user) {
			return res
				.status(404)
				.json({ success: false, message: "User not found." });
		}

		res.status(200).json({
			success: true,
			surveyType: type,
		});
	}
);

// Get distinct constituency codes
export const getConstituencyCodes = asyncErrorHandler(
	async (req, res, next) => {
		var constituencyCodes;

		if (req.user.role === "superAdmin") {
			const Schema = req.user.surveyType === "basic" ? Survey : Voter;

			constituencyCodes = await Schema.aggregate([
				{
					$group:
						Schema === Survey
							? { _id: "$constituencyCode" }
							: {
									_id: "$acNumber",
							  },
				},
				{
					$project: {
						code: "$_id",
						_id: 0,
					},
				},
				{ $sort: { code: 1 } }, // Sort by code
			]);

			constituencyCodes = constituencyCodes.map((item) => item.code);

			if (!constituencyCodes) {
				return next(new ErrorHandler(`Something went wrong`, 500));
			}
		} else {
			constituencyCodes = req.user.assigned.constituencies;
		}

		if (constituencyCodes.length === 0) {
			constituencyCodes.push(req.user.constituencyCode);
			// return next(new ErrorHandler("No Constituencies Found.", 404));
		}

		res.status(200).json({
			success: true,
			data: constituencyCodes,
		});
	}
);
