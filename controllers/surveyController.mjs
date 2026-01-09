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
		const constituencyCode = req.user.constituencyCode;

		const groupFields = [
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

		const analytics = {};

		await Promise.all(
			groupFields.map(async (field) => {
				const result = await Survey.aggregate([
					{ $match: { constituencyCode } },
					{
						$group: {
							_id: { $ifNull: [`$${field}`, "unanswered"] },
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
				]);
				// Sort boothNumber array by option value
				if (field === "boothNumber") {
					analytics[field] = result.sort((a, b) => {
						// If booth numbers are numeric, sort numerically
						const numA = Number(a.option);
						const numB = Number(b.option);
						if (!isNaN(numA) && !isNaN(numB)) {
							return numA - numB;
						}
						// Otherwise, sort alphabetically
						return String(a.option).localeCompare(String(b.option));
					});
				} else {
					analytics[field] = result;
				}
			})
		);

		const totalDocs = await Survey.countDocuments({ constituencyCode });

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

		console.log(surveysForSupport);

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

		// const formattedData = surveysForSupport.map((data) => {
		// 	const support = data._id.support;
		// 	const reason = data._id.reason;
		// 	// result[support] = result[support] || { count: 0, reason: {} };
		// 	const count += data.count;
		// 	if (reason !== "No Reason") {
		// 		result[support].reason[reason] = daa.count;
		// 	}
		// 	return result;
		// }, {});

		analytics["support"] = Object.keys(formattedData).map((key) => ({
			...formattedData[key],
			option: key,
		}));

		// delete analytics["reason"];

		res.status(200).json({
			success: true,
			message: "Analytics fetched successfully",
			analytics,
			totalDocs,
		});
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
