import express from "express";
import { authorizeRoles, isAuthenticatedUser } from "../middlewares/auth.mjs";
import {
	newVoter,
	getAllVoters,
	// deleteVoter,
	editVoter,
	addBulkVoters,
	getVoterSurveyAnalytics,
	getVoterFormOptions,
	addVoterSurvey,
	getAllVoterSurveys,
} from "../controllers/voterController.mjs";
import multer from "multer";
import dotenv from "dotenv";

const router = express.Router();
dotenv.config();

if (process.env.MULTER_STATE === "true") {
	const upload = multer({ dest: "uploads/" });
	router
		.route("/bulkAdd")
		.post(
			upload.single("file"),
			isAuthenticatedUser,
			authorizeRoles("superAdmin"),
			addBulkVoters
		);
}

router
	.route("/rmAll")
	.post(isAuthenticatedUser, authorizeRoles("superAdmin"), newVoter);

router.route("/new").post(isAuthenticatedUser, newVoter);

router.route("/edit/:id").put(isAuthenticatedUser, editVoter);

// router.route("/delete/:id").delete(isAuthenticatedUser, deleteVoter);

router.route("/all").get(isAuthenticatedUser, getAllVoters);

router
	.route("/analytics")
	.post(
		isAuthenticatedUser,
		authorizeRoles("voterAdmin", "superAdmin"),
		getVoterSurveyAnalytics
	);

router
	.route("/surveys")
	.get(
		isAuthenticatedUser,
		authorizeRoles("voterAdmin", "superAdmin"),
		getAllVoterSurveys
	);

router
	.route("/form")
	.get(
		isAuthenticatedUser,
		authorizeRoles("voterAdmin", "voterAgent"),
		getVoterFormOptions
	);

router
	.route("/survey")
	.post(isAuthenticatedUser, authorizeRoles("voterAgent"), addVoterSurvey);

export default router;