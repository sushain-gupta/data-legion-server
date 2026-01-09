import { Survey } from "../models/surveyModel.mjs";
import asyncErrorHandler from "../middlewares/asyncErrorHandler.mjs";
import ErrorHandler from "../utils/errorHandler.mjs";
import formidable from "formidable";
import { uploadBlobToS3 } from "../utils/awsFunctions.mjs";

export const newSurvey = asyncErrorHandler(async (req, res, next) => {
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
					"recordings/" +
						req.user.mobile +
						"_" +
						parsedData.name +
						"_" +
						uniqueSuffix +
						"-recording.wav"
				);

				if (result.Location) {
					try {
						const survey = await Survey.create({
							...parsedData,
							recording: result?.Location, // Make sure to update this based on the file upload result
							addedBy: req.user._id,
							constituencyCode: req.user.constituencyCode,
						});

						res.status(201).json({
							success: true,
							survey,
						});
					} catch (err) {
						console.error("Error Adding Survey:", err);
						return next(new ErrorHandler(err, 500));
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

export const addBulkSurveys = asyncErrorHandler(async (req, res, next) => {
	// Parse the Excel file
	const workbook = xlsx.readFile(req.file.path);
	const worksheet = workbook.Sheets[workbook.SheetNames[0]];
	const data = xlsx.utils.sheet_to_json(worksheet);

	if (data.length === 0) {
		return next(new ErrorHandler("No Data Found", 400));
	}

	const surveys = await Promise.all(
		data.map(async (row) => {
			const user = await Survey.create({
				name: row.Name,
				contact: row.Contact,
				boothNumber: row?.["Booth Number"] ?? "null",
				gender: row.Gender ?? "Unanswered",
				ageGroup: row?.["Age Group"] ?? "Unanswered",
				mandal: row.Mandal,
				manifesto: row?.["Party support"] ?? "Unanswered",
				reason: row.Reason ?? "Unanswered",
				occupation: row.Occupation ?? "Unanswered",
				community: row.Community ?? "Not answered",
				imageOfMLA: row?.["Image of MLA"] ?? "Unanswered",
				whoWillWin: row?.["Who Will Win"],
				nextMLA: row?.["Next MLA"],
				votedIn2018: row?.["Voted in 2018"] ?? "NOTA",
				createdAt: row?.["Created At"],
				addedBy: "654f2ed0d7117126b6108efb",
			});

			if (!user) {
				throw new ErrorHandler("Something Went Wrong", 500);
			}

			return user;
		})
	);

	res.status(200).json({
		success: true,
		message: "Surveys Added Successfully",
		surveys,
	});
});

// Get all surveys
export const getSurveys = asyncErrorHandler(async (req, res, next) => {
	const { page = 1, limit = 25 } = req.query;

	const options = {
		page: parseInt(page, 10),
		limit: parseInt(limit, 10),
		sort: { createdAt: -1 },
		populate: "addedBy",
	};

	const query = {
		addedBy: req.user._id,
		constituencyCode: req.user.constituencyCode,
	};

	try {
		const surveys = await Survey.paginate(query, options, {
			select: "name createdAt",
		});

		res.status(200).json({
			success: true,
			totalDocs: surveys.totalDocs,
			currentPage: parseInt(page),
			surveys: surveys.docs,
		});
	} catch (error) {
		console.error("Error fetching voters:", error);
		return next(new ErrorHandler("Error fetching voters", 500));
	}
});

// Get Survey Analytics
export const getBasicSurveyAnalytics = asyncErrorHandler(
	async (req, res, next) => {
		// let groupFields = ["mandal", "partyAffiliation"];
		let groupFields = ["mandal"];

		if (["surveyAdmin", "guestAdmin", "superAdmin"].includes(req.user.role)) {
			groupFields = [
				"village",
				"boothNumber",
				"gender",
				"ageGroup",
				"caste",
				"subCaste",
				"eduQualification",
				"occupation",
				"MLAperfomance",
				"whichCandidateWillWin",
				"whoWillWin",
				"whichPartyWillWin",
				"voted2019",
				"mandal",
				"isVoterLocal",
			];

			let voterData = {};

			const constituencyCode = req.user.constituencyCode;

			const matchingDocs = await Survey.aggregate([
				{
					$match: { constituencyCode },
				},
				{
					$lookup: {
						from: "users", // Name of the User collection
						localField: "addedBy", // Field from Survey collection
						foreignField: "_id", // Field from User collection
						as: "user", // Alias for the joined user document
					},
				},
				{
					$unwind: "$user", // Deconstruct the user array created by $lookup
				},
				{
					$group: {
						_id: null,
						totaldocs: { $sum: 1 },
						data: {
							$push: {
								agentName: "$user.name",
								agentContact: "$user.mobile",
								cordinates: "$location",
							},
						},
					},
				},
			]);

			const promises = groupFields.map(async (f) => {
				const data = await Survey.aggregate([
					{
						$match: { constituencyCode },
					},
					{
						$group: {
							_id: `$${f}`,
							count: { $sum: 1 },
						},
					},
				]);

				const formattedData = data.map((daa) => ({
					[daa._id]: daa.count,
				}));

				voterData[f] = formattedData;
			});

			const surveysForSupport = await Survey.aggregate([
				{
					$match: { constituencyCode },
				},
				{
					$group: {
						_id: {
							support: "$support",
							reason: {
								$cond: {
									if: { $eq: ["$reason", null] },
									then: "No Reason",
									else: "$reason",
								},
							},
						},
						count: { $sum: 1 },
					},
				},
			]);

			const formattedData = surveysForSupport.reduce((result, daa) => {
				const support = daa._id.support;
				const reason = daa._id.reason;
				result[support] = result[support] || { count: 0, reason: {} };
				result[support].count += daa.count;
				if (reason !== "No Reason") {
					result[support].reason[reason] = daa.count;
				}
				return result;
			}, {});

			voterData["support"] = Object.keys(formattedData).map((key) => ({
				[key]: formattedData[key],
			}));

			delete voterData["reason"];
			Promise.all(promises)
				.then(() => {
					res.status(200).json({
						success: true,
						data: {
							...voterData,
							locations: matchingDocs[0]?.data || [],
						},
						totalDocs: matchingDocs[0]?.totaldocs || 0,
					});
				})
				.catch((error) => {
					return next(new ErrorHandler(error, 404));
				});
		}
	}
);

// Get Survey Recordings
export const getBasicSurveyRecordings = asyncErrorHandler(
	async (req, res, next) => {
		try {
			const page = parseInt(req.query.page, 10) || 1;
			const limit = parseInt(req.query.limit, 10) || 16;

			// Aggregation pipeline to retrieve survey recordings
			const pipeline = [
				{
					$lookup: {
						from: "users",
						localField: "addedBy",
						foreignField: "_id",
						as: "addedByUser",
					},
				},
				{
					$unwind: "$addedByUser",
				},
				{
					$match: {
						constituencyCode: req.user.constituencyCode,
						name: { $exists: true },
					},
				},
				{
					$project: {
						name: 1,
						contact: "$addedByUser.mobile",
						createdAt: 1,
						recording: 1,
					},
				},
			];

			// Execute the aggregation pipeline with pagination
			const options = {
				page,
				limit,
				sort: { createdAt: -1 },
				customLabels: {
					totalDocs: "totalCount",
					docs: "paginatedResults",
				},
			};

			const result = await Survey.paginate(Survey.aggregate(pipeline), options);

			res.status(200).json({
				success: true,
				data: result.paginatedResults,
				totalPages: result.totalPages,
				currentPage: result.page,
				totalDocs: result.totalCount,
			});
		} catch (err) {
			return next(new ErrorHandler(err, 500));
		}
	}
);
