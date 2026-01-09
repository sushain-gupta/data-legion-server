import express from "express";
import { downloadCSVData } from "../controllers/csvDownloadController.mjs";
import { authorizeRoles, isAuthenticatedUser } from "../middlewares/auth.mjs";

const router = express.Router();

router
	.route("/")
	.post(
		isAuthenticatedUser,
		authorizeRoles("superAdmin", "surveyAdmin", "voterAdmin"),
		downloadCSVData
	);

export default router;
