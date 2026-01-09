import express from "express";
import { editVoter } from "../controllers/voterController.mjs";
import dotenv from "dotenv";
import { editBulkSurveys } from "../controllers/scriptcontroller.mjs";

const router = express.Router();
dotenv.config();

router.route("/editBulkSurveys").post(editBulkSurveys);

export default router;
