import asyncErrorHandler from "../middlewares/asyncErrorHandler.mjs";
import { Survey } from "../models/surveyModel.mjs";
import { Voter } from "../models/voterModel.mjs";

export const editBulkSurveys = asyncErrorHandler(async (req, res, next) => {
	const dateToMatch = new Date("2023-11-20"); // Replace with your desired date

	// Update documents where 'createdAt' matches the specified date
	const result = await Survey.updateMany(
		{
			createdAt: {
				$gte: dateToMatch,
				$lt: new Date(dateToMatch.getTime() + 24 * 60 * 60 * 1000),
			},
		},
		{ $set: { constituencyCode: "3" } }
	);

	res.send("done");
	// // Check if any document was modified
	// if (result.nModified > 0) {
	//     res.status(200).json({
	//         success: true,
	//         message: `${result.nModified} Survey Details Edited`,
	//     });
	// } else {
	//     res.status(404).json({
	//         success: false,
	//         message: "No matching documents found for the provided date",
	//     });
	// }
});

export const editBulkVoters = asyncErrorHandler(async (req, res, next) => {
	// Update documents where 'createdAt' matches the specified date
	const result = await Voter.updateMany(
		{
			surveyTaken: true,
		},
		{ $set: { surveyTaken: false, survey: {}, survyedBy: "" } }
	);

	const deleted = await Voter.deleteMany({
		isAddition: true,
	});

	res.send("done");
});
