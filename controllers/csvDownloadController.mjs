import asyncErrorHandler from "../middlewares/asyncErrorHandler.mjs";
import { Survey } from "../models/surveyModel.mjs";
import { Voter } from "../models/voterModel.mjs";
import ErrorHandler from "../utils/errorHandler.mjs";
import xlsx from "xlsx";
import { formateDataAndTime } from "../utils/formateDateAndTime.mjs";

export const downloadCSVData = asyncErrorHandler(async (req, res, next) => {
	try {
		const ps = req.body?.ps;
		// const isAddition = req.body?.q;

		const { role, surveyType } = req.user;

		let schema = Voter;
		if (role === "surveyAdmin" || surveyType === "survey") schema = Survey;

		let data = await schema.aggregate([
			{
				$match: {
					acNumber: req.user.constituencyCode,
					...(ps && ps.length > 0 && { pollingStation: { $in: ps } }),
					surveyTaken: true,
				},
			},
		]);

		if (!data || data.length === 0)
			return next(new ErrorHandler("Data Not Found", 404));

		if (role === "surveyAdmin" || surveyType === "survey") {
			var code = req.user.constituencyCode;
			var formattedData;

			if (code == "140")
				formattedData = data.map((voter) => ({
					Name: voter.name,
					Contact: voter.contact,
					"EPIC Serial Number": voter.epic,
					"Booth Number": voter.boothNumber,
					// Village: voter.village,
					Mandal: voter.mandal,
					Gender: voter.gender,
					"Age Group": voter.ageGroup,
					"Supporting Party": voter.support,
					"Local Voter": voter.isVoterLocal,
					"Staying In": voter.stayingIn,
					"Created At": voter.createdAt,
					Location: voter.location
						? voter.location.lat + "," + voter.location.lng
						: "",
					"Constituency Code": voter.constituencyCode || "",
				}));
			else
				formattedData = data.map((voter) => ({
					Name: voter.name,
					Contact: voter.contact,
					"Booth Number": voter.boothNumber,
					Village: voter.village,
					Mandal: voter.mandal,
					Gender: voter.gender,
					"Age Group": voter.ageGroup,
					Caste: voter.caste,
					"Sub Caste": voter.subCaste,
					"Education Qualification": voter.eduQualification,
					Occupation: voter.occupation,
					"Supporting Party": voter.support,
					Reason: voter.reason,
					"MLA Perfomance": voter.MLAperfomance,
					"Which candidate will win": voter?.whichCandidateWillWin || "",
					"Who Will Win": voter.whoWillWin,
					Demand: voter.demand,
					"Which Party Will Win": voter.whichPartyWillWin,
					"Voted in 2019": voter.voted2019,
					"Type of person": voter.typeOfPerson,
					"Created At": voter.createdAt,
					Location: voter.location
						? voter.location.lat + "," + voter.location.lng
						: "",
					"Constituency Code": voter.constituencyCode || "",
				}));
		} else {
			var formattedData = data.map((voter) => {
				const {
					corrected = null, // or you can use {} or any other default value
					incorrectFields = {},
					...otherFields
				} = voter?.survey || {};

				otherFields["Is Addition"] = false;

				if (voter.isAddition) {
					otherFields["Mobile Number"] = voter.mobile;
					otherFields["Is Addition"] = true;
				}

				const {
					Name: correctedName,
					"Fathers Name": correctedFathersName,
					"Mothers Name": correctedMothersName,
					"Husbands Name": correctedHusbandsName,
					Others: correctedOthers,
					Age: correctedAge,
					"Voter ID": correctedVoterId,
					Gender: correctedGender,
					"House Number": correctedHouseNumber,
				} = corrected ?? {};

				return {
					"AC Number": voter.acNumber,
					"AC Name": voter.acName,

					"Polling Station": voter.pollingStation,

					Section: voter.sectionNumber + " - " + voter.sectionName,

					"Serial Number": voter?.serialNumber,

					Name: voter.name,
					...(correctedName && { "Corrected Name": correctedName }),

					Gender: voter.gender,
					...(correctedGender && { "Corrected Gender": correctedGender }),

					Age: voter.age,
					...(correctedAge && { "Corrected Age": correctedAge }),

					"Voter ID": voter.voterId || otherFields.voterId,
					...(correctedVoterId && { "Corrected Voter ID": correctedVoterId }),

					"House Number": `="${voter.houseNumber}"`,
					...(correctedHouseNumber && {
						"Corrected House Number": `="${correctedHouseNumber}"`,
					}),

					"Fathers Name": voter.fathersName,
					...(correctedFathersName && {
						"Corrected Fathers Name": correctedFathersName,
					}),

					"Mothers Name": voter.mothersName,
					...(correctedMothersName && {
						"Corrected Mothers Name": correctedMothersName,
					}),

					"Husbands Name": voter.husbandsName,
					...(correctedHusbandsName && {
						"Corrected Husbands Name": correctedHusbandsName,
					}),

					Others: voter.others,
					...(correctedOthers && {
						Others: correctedOthers,
					}),

					...otherFields,
					// Contact: voter.survey.Mobile,
					// Village: voter.village,
					// Mandal: voter.mandal,
					// "Party Affiliation": voter.partyAffiliation,
					// "Scheme Beneficiary": voter.schemeBeneficiary,
					// Scheme: voter.scheme,
					Location: voter.location.lat + "," + voter.location.lng,
					"Surveyed At": formateDataAndTime(voter.surveyedAt),
				};
			});
		}

		const ws = xlsx.utils.json_to_sheet(formattedData);
		const wb = xlsx.utils.book_new();
		xlsx.utils.book_append_sheet(wb, ws, "Voters");
		const csv = xlsx.write(wb, { bookType: "csv", type: "buffer" });
		res.setHeader("Content-Type", "text/csv");
		res.setHeader("Content-Disposition", "attachment; filename=voters.csv");

		res.status(200).send(csv).json({
			success: true,
		});
	} catch (error) {
		console.error("Error downloading voters:", error);
		return next(new ErrorHandler(error, 500));
	}
});
