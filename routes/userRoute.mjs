import express from "express";
import {
	addAdmin,
	addAgent,
	addBulkUsers,
	editAdmin,
	editAgent,
	getAdminFormOptions,
	getAdmins,
	getAgentFormOptions,
	getAgents,
	getConstituencyCodes,
	getUserDetails,
	logoutUser,
	removeUser,
	sendOtp,
	updateUserConstituencyCode,
	updateUserSurveyType,
	verifyOtpForLogin,
} from "../controllers/userController.mjs";
import { authorizeRoles, isAuthenticatedUser } from "../middlewares/auth.mjs";
import multer from "multer";
import dotenv from "dotenv";

const router = express.Router();
dotenv.config();

// Multer for handling file uploads
if (process.env.MULTER_STATE === "true") {
	const upload = multer({ dest: "uploads/" });
	router.route("/bulkAdd").post(upload.single("file"), addBulkUsers);
}

router.route("/getOtp").post(sendOtp);

router.route("/verifyOtp").post(verifyOtpForLogin);

router.route("/me").get(isAuthenticatedUser, getUserDetails);

router.route("/logout").get(logoutUser);

router
	.route("/updateUserSurveyType")
	.put(isAuthenticatedUser, authorizeRoles("superAdmin"), updateUserSurveyType);

router
	.route("/constituencyCodes")
	.get(
		isAuthenticatedUser,
		authorizeRoles("surveyAdmin", "voterAdmin", "superAdmin"),
		getConstituencyCodes
	);

router
	.route("/updateConstituencyCode")
	.put(
		isAuthenticatedUser,
		authorizeRoles("surveyAdmin", "voterAdmin", "superAdmin"),
		updateUserConstituencyCode
	);

// Add, edit, get Admin
router
	.route("/addAdmin")
	.post(isAuthenticatedUser, authorizeRoles("superAdmin"), addAdmin);

router
	.route("/editAdmin")
	.post(isAuthenticatedUser, authorizeRoles("superAdmin"), editAdmin);

router
	.route("/admins")
	.get(isAuthenticatedUser, authorizeRoles("superAdmin"), getAdmins);

// Add, edit, get Agents
router
	.route("/addAgent")
	.post(
		isAuthenticatedUser,
		authorizeRoles("superAdmin", "voterAdmin", "surveyAdmin"),
		addAgent
	);

router
	.route("/editAgent")
	.post(
		isAuthenticatedUser,
		authorizeRoles("superAdmin", "voterAdmin", "surveyAdmin"),
		editAgent
	);

router
	.route("/agents")
	.get(
		isAuthenticatedUser,
		authorizeRoles("superAdmin", "voterAdmin", "surveyAdmin"),
		getAgents
	);

// Form based routers

router
	.route("/adminForm")
	.get(
		isAuthenticatedUser,
		authorizeRoles("superAdmin", "voterAdmin", "surveyAdmin"),
		getAdminFormOptions
	);

router
	.route("/agentForm")
	.get(
		isAuthenticatedUser,
		authorizeRoles("superAdmin", "voterAdmin", "surveyAdmin"),
		getAgentFormOptions
	);

// User based router
router
	.route("/remove")
	.put(
		isAuthenticatedUser,
		authorizeRoles("superAdmin", "surveyAdmin", "voterAdmin"),
		removeUser
	);

// router.route("/admin/voters").get(isAuthenticatedUser, authorizeRoles("admin"), getAllVoters);

export default router;
