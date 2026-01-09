import express from "express";
import { authorizeRoles, isAuthenticatedUser } from "../middlewares/auth.mjs";
import multer from "multer";
import dotenv from "dotenv";
import {
	addBulkSurveys,
	getBasicSurveyAnalytics,
	getBasicSurveyRecordings,
	getSurveys,
	newSurvey,
} from "../controllers/surveyController.mjs";
import { removeDuplicates } from "../controllers/userController.mjs";

const router = express.Router();
dotenv.config();

if (process.env.MULTER_STATE === "true") {
	const upload = multer({ dest: "uploads/" });
	router.route("/bulkAdd").post(upload.single("file"), addBulkSurveys);
}
// router.route("/new").post(isAuthenticatedUser, newVoter);

// router.route("/edit/:id").put(isAuthenticatedUser, editVoter);

// router.route("/delete/:id").delete(isAuthenticatedUser, deleteVoter);

router.route("/new").post(isAuthenticatedUser, newSurvey);

router.route("/all").get(isAuthenticatedUser, getSurveys);
router.route("/rds").get(isAuthenticatedUser, removeDuplicates);

// Admin Only
router
	.route("/analytics")
	.get(
		isAuthenticatedUser,
		authorizeRoles("surveyAdmin", "guestAdmin", "superAdmin"),
		getBasicSurveyAnalytics
	);

router
	.route("/recordings")
	.get(
		isAuthenticatedUser,
		authorizeRoles("surveyAdmin", "superAdmin"),
		getBasicSurveyRecordings
	);

export default router;
