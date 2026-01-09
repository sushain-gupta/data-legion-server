import moment from "moment-timezone";
import formidable from "formidable";
import asyncErrorHandler from "../middlewares/asyncErrorHandler.mjs";
import ErrorHandler from "../utils/errorHandler.mjs";
import { uploadBlobToS3 } from "../utils/awsFunctions.mjs";
import { Voter } from "../models/voterModel.mjs";
import xlsx from "xlsx";

// Add bulk users
export const addBulkVoters = asyncErrorHandler(async (req, res, next) => {
	const filePath = req.file.path;
	const duplicateVoters = [];
	const insertedVoterIds = [];

	let noOfDuplicates = 0;

	// Parse the Excel file
	const workbook = xlsx.readFile(filePath, { cellDates: false, raw: false });
	const worksheet = workbook.Sheets[workbook.SheetNames[0]];
	const data = xlsx.utils.sheet_to_json(worksheet, {
		raw: false,
		defval: "",
	});

	if (data.length === 0) {
		return next(new ErrorHandler("No Data Found", 400));
	}

	try {
		const formatedData = data.map((row) => ({
			acNumber: row["AC Number"],
			acName: row["AC Name"] || row["Mandal"],
			part: row["Part Number"] || "N/A",
			ward: row["Ward"] || "N/A",
			serialNumber: row["Serial Number"],
			sectionName: row["Section"] || "N/A",
			sectionNumber: row["Section Number"] || "0",
			pageNumber: row["Page Number"],
			pollingStation: row["Polling Station"],
			pollingStationAddress: row["Polling Station Address"] || "N/A",
			slNo: row["SL NO"] || "0",
			name: row["Name"],
			voterId: row["Voter ID"],
			fathersName: row["Fathers Name"] !== "" ? row["Fathers Name"] : null,
			wifesName: row["Wifes Name"] !== "" ? row["Wifes Name"] : null,
			mothersName: row["Mothers Name"] !== "" ? row["Mothers Name"] : null,
			husbandsName: row["Husbands Name"] !== "" ? row["Husbands Name"] : null,
			others: row["Others"] !== "" ? row["Others"] : null,
			age: row["Age"],
			gender: row["Gender"],
			houseNumber: row["House Number"]
				? String(row["House Number"])
				: row["Door No"]
				? String(row["Door No"])
				: "",
		}));

		try {
			let batch = [];
			let start = 0;
			let end = formatedData.length < 5000 ? formatedData.length : 5000;

			while (start < formatedData.length) {
				batch = formatedData.slice(start, end);

				try {
					await Voter.insertMany(batch, { ordered: false });

					// ✅ All inserted
					batch.forEach((v) => insertedVoterIds.push(v.voterId));
				} catch (err) {
					if (err.code === 11000 && err.writeErrors?.length) {
						// Collect duplicate voterIds
						const duplicateSet = new Set(
							err.writeErrors.map(({ err: e }) => e.op.voterId)
						);

						// Inserted = batch - duplicates
						batch.forEach((v) => {
							if (!duplicateSet.has(v.voterId)) {
								insertedVoterIds.push(v.voterId);
							}
						});

						// Optional: collect duplicates if still needed
						duplicateSet.forEach((voterId) => duplicateVoters.push(voterId));

						noOfDuplicates += duplicateSet.size;
					} else {
						return next(new ErrorHandler(err, 400));
					}
				}

				start = end;
				end = Math.min(start + 5000, formatedData.length);
			}
		} catch (err) {
			return next(new ErrorHandler(err, 400));
		}
	} catch (err) {
		return next(new ErrorHandler(err, 400));
	}

	res.status(200).json({
		success: true,
		insertedVoterIds,
		noOfDuplicates,
		duplicateVoters,
		message: "Voters Added Successfully",
	});
});

export const removeAllVoter = asyncErrorHandler(async (req, res, next) => {
	const { constituencyCode } = req.user;

	Voter.deleteMany({ acNumber: constituencyCode });
});

// Add new voter
export const newVoter = asyncErrorHandler(async (req, res, next) => {
	const form = formidable({
		multiples: true,
		maxFieldsSize: 200 * 1024 * 1024, // 200 MB
	});

	form.parse(req, async (err, fields, files) => {
		if (err) return next(err);

		const parsedData = JSON.parse(fields.data);

		if (fields?.recording) {
			const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
			const result = await uploadBlobToS3(
				fields?.recording, // Use the file path
				"recordings/" +
					req.user.mobile +
					"_" +
					parsedData.name +
					"_" +
					uniqueSuffix +
					"-recording.wav"
			);

			if (result.Location) {
				const { section, voterRel = {}, ...otherDetails } = parsedData;

				const [sectionNumber, sectionName] = section.split(" - ");

				const voter = await Voter.create({
					...otherDetails,
					sectionNumber,
					sectionName,
					recording: result?.Location,
					"Voter Present Status": "Present",
					isAddition: true,
					surveyTaken: true,
					addedBy: req.user._id,
					surveyedBy: req.user._id,
					surveyedAt: Date.now(),
					acName: voterRel?.acName,
					acNumber: req.user.constituencyCode,
					assignedTo: voterRel?.assignedTo,
				});

				res.status(201).json({
					success: true,
					voter,
				});
			}
		} else {
			return next(new ErrorHandler("Recoding Missing!", 400));
		}
	});
});

// Edit Voter
export const editVoter = asyncErrorHandler(async (req, res, next) => {
	const dataToUpdate = req.body.data;
	const Schema =
		req.user.role === "voterAdmin" ? VoterSurveyAgent : BasicSurveyAgent;

	let agent = await Schema.findById(dataToUpdate.id).select(
		"name mobile assigned constituencyCode role createdAt"
	);

	if (agent) {
		agent.name = dataToUpdate.name;
		agent.mobile = dataToUpdate.mobile;
		agent.assigned = dataToUpdate.assigned;

		await agent.save();
	} else {
		return next(new ErrorHandler("Agents do not exist", 400));
	}

	const agents = await Schema.find()
		.sort({ createdAt: -1 })
		.select("name mobile assigned constituencyCode role createdAt");

	res.status(200).json({
		success: true,
		message: "Agent Details Updated",
		agents,
		agent,
	});
});

// Genrate Form Data
export const getVoterFormOptions = asyncErrorHandler(async (req, res, next) => {
	var voter;
	const voterId = req.query?.id;
	// const role = req.user.role;
	// const constituency = req.user.constituencyCode;

	try {
		voter = await Voter.findById(voterId);

		if (!voter)
			next(new ErrorHandler("Voter does not exist or Invalid ID", 400));
	} catch (err) {
		return next(new ErrorHandler(err, 500));
	}

	res.status(200).json({
		success: true,
		voter,
	});
});

// Add Voter Survey
export const addVoterSurvey = asyncErrorHandler(async (req, res, next) => {
	const form = formidable({
		multiples: true,
		maxFieldsSize: 200 * 1024 * 1024, // 200 MB
	});

	form.parse(req, async (err, fields, files) => {
		if (err) return next(new ErrorHandler(err, 404));

		try {
			const parsedData = JSON.parse(fields.data);

			if (fields?.recording) {
				const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
				const result = await uploadBlobToS3(
					fields?.recording, // Use the file path
					"recordings/voterSurvey" +
						req.user.mobile +
						"_" +
						parsedData.name +
						"_" +
						uniqueSuffix +
						"-recording.wav"
				);

				if (result.Location) {
					let voter = await Voter.findById(parsedData.id);

					if (voter) {
						voter.survey = parsedData.survey;
						voter.location = parsedData.location;
						voter.recording = result?.Location;
						voter.surveyTaken = true;
						voter.surveyedBy = req.user._id;
						voter.surveyedAt = Date.now();

						voter = await voter.save();

						if (!voter)
							return next(new ErrorHandler("Somthing went wrong.", 500));

						res.status(201).json({
							success: true,
							voter,
						});
					}
				}
			} else {
				return next(new ErrorHandler("Recoding Missing!", 400));
			}
		} catch (err) {
			return next(new ErrorHandler(err, 404));
		}
	});
});

// Delete Voter
export const deleteVoter = asyncErrorHandler(async (req, res, next) => {
	const voter = await Voter.findById(req.params.id);

	if (!voter) return next(new ErrorHandler("Voter Not Found", 404));

	const utcDate = moment(voter.createdAt);
	const istDate = utcDate.tz("Asia/Kolkata");

	const timeDiff = Math.abs(new Date() - istDate) / 36e5;
	if (timeDiff > 1)
		return next(new ErrorHandler("Voter cannot be deleted", 400));

	await Voter.findByIdAndRemove(req.params.id);

	res.status(200).json({
		success: true,
		message: "Voter deleted",
	});
});

// Get All Voters
export const getAllVoters = asyncErrorHandler(async (req, res, next) => {
	const { page = 1, limit = 24, q = "", ps, status } = req.query;

	const options = {
		page: parseInt(page),
		limit: parseInt(limit),
		sort: {
			isAddition: 1,
			surveyTaken: 1,
			serialNumber: 1,
			surveyedAt: -1,
			// pollingStation: 1,
			createdAt: -1,
		},
	};

	const acAssigned = req.user?.assigned?.constituencies;
	const surveyTaken = status == "completed" ? true : false;
	const isAgent = req.user.role === "voterAgent";
	var pollingStation = ps != "null" && ps.length > 0 ? ps.split(",") : null;

	if (req.user.role === "voterAdmin" && pollingStation !== null) {
		const assignedStations = req.user?.assigned?.pollingStations || [];

		// if pollingStation is null, or any station is not allowed
		const isInvalid =
			!pollingStation ||
			pollingStation.some((ps) => !assignedStations.includes(ps));

		if (isInvalid) {
			return next(
				new ErrorHandler(
					`You are not authorized to access one or more polling stations`,
					403
				)
			);
		}
	}

	if (req.user.role === "voterAdmin" && pollingStation == null) {
		pollingStation = req.user?.assigned?.pollingStations;

		if (pollingStation.length === 0) {
			pollingStation = null;
		}
	}

	const query = {
		...(acAssigned && {
			acNumber: { $in: acAssigned },
		},
		{
			...(surveyTaken && {
				surveyTaken,
				surveyedBy: req.user._id,
			}),
		}),
		...(pollingStation && { pollingStation: { $in: pollingStation } }),
		...(isAgent && { assignedTo: { $in: req.user._id } }),

		$or: [
			{ name: { $regex: q, $options: "i" } }, // Matches name case-insensitively
			{ voterId: { $regex: q, $options: "i" } }, // Matches voterId case-insensitively
			{ fathersName: { $regex: q, $options: "i" } }, // Matches fathersName case-insensitively
			{ mothersName: { $regex: q, $options: "i" } }, // Matches mothersName case-insensitively
			{ husbandsName: { $regex: q, $options: "i" } }, // Matches husbandsName case-insensitively
			{ others: { $regex: q, $options: "i" } }, // Matches othersName case-insensitively
			{ houseNumber: { $regex: q, $options: "i" } }, // Matches houseNumber case-insensitively
		],
	};

	try {
		const voters = await Voter.paginate(query, options);

		const totalSurveysRemaining = await Voter.countDocuments({
			...(acAssigned && {
				acNumber: { $in: acAssigned },
			}),
			...(pollingStation && { pollingStation: { $in: pollingStation } }),
			...(isAgent && {
				assignedTo: { $in: req.user._id },
			}),
			surveyTaken: false,
		});

		const totalSurveysTaken = await Voter.countDocuments({
			...(acAssigned && {
				acNumber: { $in: acAssigned },
			}),
			...(pollingStation && { pollingStation: { $in: pollingStation } }),
			...(isAgent && {
				assignedTo: { $in: req.user._id },
			}),
			// ...(isAgent && {
			// 	assignedTo: { $in: req.user._id },
			// }),
			// ...(psAssigned && {
			// 	assignedTo: userId,
			// }),
			surveyTaken: true,
		});

		const acWiseAnalytics = await Voter.aggregate([
			// 1️⃣ Group by AC + Polling Station
			{
				$match: {
					...(pollingStation && { pollingStation: { $in: pollingStation } }),
				},
			},
			{
				$group: {
					_id: {
						acNumber: "$acNumber",
						pollingStation: "$pollingStation",
					},
					verifiedDocs: {
						$sum: {
							$cond: [{ $eq: ["$surveyTaken", true] }, 1, 0],
						},
					},
					remainingDocs: {
						$sum: {
							$cond: [{ $eq: ["$surveyTaken", false] }, 1, 0],
						},
					},
				},
			},

			// 2️⃣ Group by AC only, push polling stations as array
			{
				$group: {
					_id: "$_id.acNumber",
					pollingStations: {
						$push: {
							pollingStation: "$_id.pollingStation",
							totalDocs: "$totalDocs",
							remainingDocs: "$remainingDocs",
						},
					},
				},
			},

			// 3️⃣ Final shape
			{
				$project: {
					_id: 0,
					acNumber: "$_id",
					pollingStations: 1,
				},
			},
		]);

		const individualSurveyCount = await Voter.find({
			surveyedBy: req.user._id,
		}).count();

		// Return the total number of documents along with the paginated data
		res.status(200).json({
			success: true,
			totalDocs: voters.totalDocs,
			count: req.query.page,
			voters: voters.docs,
			individualSurveyCount,
			totalSurveysTaken,
			totalSurveysRemaining,
			acWiseAnalytics,
		});
	} catch (error) {
		console.error("Error fetching voters:", error);
		return next(new ErrorHandler(`Error fetching voters: ${error}`, 500));
	}
});

// Get All Voter Surveys
export const getAllVoterSurveys = asyncErrorHandler(async (req, res, next) => {
	try {
		const { page = 1, limit = 24, q = "", ps } = req.query;
		const skip = (page - 1) * limit;

		const pollingStation = ps != "null" && ps.length > 0 ? ps.split(",") : null;

		// Aggregation pipeline to retrieve survey recordings
		const pipeline = [
			{
				$match: {
					acNumber: req.user.constituencyCode,
					...(pollingStation && { pollingStation: { $in: pollingStation } }),
					surveyTaken: true,
					$or: [
						{ name: { $regex: q, $options: "i" } }, // Matches name case-insensitively
						{ voterId: { $regex: q, $options: "i" } }, // Matches voterId case-insensitively
						{ fathersName: { $regex: q, $options: "i" } }, // Matches fathersName case-insensitively
						{ mothersName: { $regex: q, $options: "i" } }, // Matches mothersName case-insensitively
						{ husbandsName: { $regex: q, $options: "i" } }, // Matches husbandsName case-insensitively
						{ others: { $regex: q, $options: "i" } }, // Matches othersName case-insensitively
						{ houseNumber: { $regex: q, $options: "i" } }, // Matches houseNumber case-insensitively
					],
				},
			},
			{
				$lookup: {
					from: "users",
					localField: "surveyedBy",
					foreignField: "_id",
					as: "surveyedBy",
				},
			},
			{
				$unwind: {
					path: "$surveyedBy",
					preserveNullAndEmptyArrays: true,
				},
			},

			{
				$addFields: {
					agentDetails: {
						name: "$surveyedBy.name",
						mobile: "$surveyedBy.mobile",
					},
				},
			},
			{
				$sort: {
					surveyedAt: -1,
					updatedAt: -1,
				},
			},
			{
				$project: {
					surveyedBy: 0,
				},
			},
			// Add pagination
			{
				$skip: skip,
			},
			{
				$limit: parseInt(limit),
			},
		];

		// Run the aggregation with allowDiskUse
		const result = await Voter.aggregate(pipeline).allowDiskUse(true);

		// To get the total document count
		const totalDocs = await Voter.countDocuments({
			acNumber: req.user.constituencyCode,
			surveyTaken: true,
		});

		// Send the response
		res.status(200).json({
			success: true,
			surveys: result,
			currentPage: page,
			totalDocs,
		});
	} catch (err) {
		return next(new ErrorHandler(err, 500));
	}
});

// Get Survey Analytics
export const getVoterSurveyAnalytics = asyncErrorHandler(
	async (req, res, next) => {
		try {
			let pollingStation = req.body?.ps;
			const assigedStations = req.user?.assigned?.pollingStations || [];

			// normalize ps → always array or null
			if (typeof pollingStation === "string") {
				pollingStation = pollingStation.split(",").map((p) => p.trim());
			}

			if (!Array.isArray(pollingStation) || pollingStation.length === 0) {
				pollingStation = null;
			}

			// voterAdmin fallback logic
			if (
				req.user.role === "voterAdmin" &&
				!pollingStation &&
				assigedStations.length > 0
			) {
				pollingStation = assigedStations;
			}

			// if (req.user.role === "voterAdmin" && pollingStation.length === 0) {
			// 	pollingStation =  || [];
			// }

			// let groupFields = [
			// 	"village",
			// 	"boothNumber",
			// 	"gender",
			// 	"ageGroup",
			// 	"caste",
			// 	"subCaste",
			// 	"eduQualification",
			// 	"occupation",
			// 	"MLAperfomance",
			// 	"whichCandidateWillWin",
			// 	"whoWillWin",
			// 	"whichPartyWillWin",
			// 	"voted2019",
			// 	"mandal",
			// 	"isVoterLocal",
			// ];

			// let voterData = {};

			const constituencyCode = req.user.constituencyCode;
			const baseMatch = {
				acNumber: constituencyCode,
				...(pollingStation ? { pollingStation: { $in: pollingStation } } : {}),
			};

			const excelWiseAnalytics = await Voter.aggregate([
				{
					$match: {
						acNumber: constituencyCode,
						surveyTaken: true,
					},
				},
				{
					$facet: {
						ageGroupAnalysis: [
							{
								$bucket: {
									groupBy: "$age",
									boundaries: [18, 31, 41, 51, 61, Infinity],
									default: "Unknown",
									output: {
										count: { $sum: 1 },
									},
								},
							},
							{
								$project: {
									ageGroup: {
										$arrayElemAt: [
											["18-30", "31-40", "41-50", "51-60", "60+"],
											{
												$indexOfArray: [[18, 31, 41, 51, 61], "$_id"],
											},
										],
									},
									count: 1,
								},
							},
						],
						genderAnalysis: [
							{
								$group: {
									_id: "$gender",
									count: { $sum: 1 },
								},
							},
						],
						// Add more facets for other fields as needed
					},
				},
			]);

			const surveyWiseAnalytics = await Voter.aggregate([
				{ $match: baseMatch },

				{
					$facet: {
						ageGroupAnalysis: [
							{ $match: { surveyTaken: true } },
							{
								$project: {
									age: {
										$toInt: {
											$ifNull: ["$survey.corrected.Age", "$age"],
										},
									},
								},
							},
							{
								$bucket: {
									groupBy: "$age",
									boundaries: [18, 31, 41, 51, 61, Infinity],
									default: "Unknown",
									output: { count: { $sum: 1 } },
								},
							},
							{
								$project: {
									_id: 0,
									option: {
										$arrayElemAt: [
											["18-30", "31-40", "41-50", "51-60", "60+"],
											{ $indexOfArray: [[18, 31, 41, 51, 61], "$_id"] },
										],
									},
									count: 1,
								},
							},
						],

						genderAnalysis: [
							{ $match: { surveyTaken: true } },
							{
								$project: {
									option: {
										$toLower: {
											$ifNull: ["$survey.corrected.Gender", "$gender"],
										},
									},
								},
							},
							{
								$group: {
									_id: "$option",
									count: { $sum: 1 },
								},
							},
							{
								$project: {
									_id: 0,
									option: "$_id",
									count: 1,
								},
							},
							{ $sort: { count: -1 } },
						],
						partySupportAnalysis: [
							{
								$match: { surveyTaken: true },
							},
							{
								$project: {
									partySupport: "$survey.Which party do you support",
								},
							},
							{
								$group: {
									_id: "$partySupport",
									count: { $sum: 1 },
								},
							},
							{
								$project: {
									_id: 0,
									option: "$_id",
									count: 1,
								},
							},
						],

						occupationAnalysis: [
							{
								$match: { surveyTaken: true },
							},
							{
								$project: {
									occupation: "$survey.What is your occupation",
								},
							},
							{
								$group: {
									_id: "$occupation",
									count: { $sum: 1 },
								},
							},
							{
								$project: {
									_id: 0,
									option: "$_id",
									count: 1,
								},
							},
						],

						casteAnalysis: [
							{
								$match: { surveyTaken: true },
							},
							{
								$project: {
									caste: "$survey.What is your caste",
								},
							},
							{
								$group: {
									_id: "$caste",
									count: { $sum: 1 },
								},
							},
							{
								$project: {
									_id: 0,
									option: "$_id",
									count: 1,
								},
							},
						],

						locationDetails: [
							{ $match: { surveyTaken: true } },
							{
								$lookup: {
									from: "users",
									localField: "surveyedBy",
									foreignField: "_id",
									as: "surveyedBy",
								},
							},
							{ $unwind: "$surveyedBy" },
							{
								$project: {
									_id: 0,
									location: 1,
									choice: "$survey.Which party do you support",
									agent: {
										name: "$surveyedBy.name",
										mobile: "$surveyedBy.mobile",
									},
								},
							},
						],

						pollingStations: [
							{
								$group: {
									_id: "$pollingStation",
									address: { $first: "$pollingStationAddress" },
									totalDocs: { $sum: 1 },
									surveyTakenCount: {
										$sum: { $cond: ["$surveyTaken", 1, 0] },
									},
								},
							},
							{
								$project: {
									_id: 0,
									pollingStation: "$_id",
									address: 1,
									totalDocs: 1,
									surveyTakenCount: 1,
								},
							},
						],

						count: [
							{ $match: { surveyTaken: true } },
							{ $count: "totalMatched" },
						],
					},
				},

				{
					$project: {
						ageGroupAnalysis: 1,
						genderAnalysis: 1,
						partySupportAnalysis: 1,
						occupationAnalysis: 1,
						casteAnalysis: 1,
						locationDetails: 1,
						pollingStations: 1,
						totalDocs: {
							$ifNull: [{ $arrayElemAt: ["$count.totalMatched", 0] }, 0],
						},
					},
				},
			]);

			res.status(200).json({
				success: true,
				message: "Analytics fetched successfully",
				analytics: surveyWiseAnalytics[0],
			});
		} catch (err) {
			return next(new ErrorHandler(err, 500));
		}
	}
);
