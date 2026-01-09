import jwt from "jsonwebtoken";
import ErrorHandler from "../utils/errorHandler.mjs";
import asyncErrorHandler from "./asyncErrorHandler.mjs";
import { User } from "../models/userModel.mjs";

export const isAuthenticatedUser = asyncErrorHandler(async (req, res, next) => {
	let token;
	if (
		req.headers.authorization &&
		req.headers.authorization.startsWith("Bearer")
	) {
		token = req.headers.authorization.split(" ")[1];
	}

	if (!token || token.trim() === "") {
		return next(new ErrorHandler("Please Login to Access", 401));
	}

	try {
		const decodedData = jwt.verify(token, process.env.JWT_SECRET);
		req.user = await User.findById(decodedData.id);
		next();
	} catch (err) {
		// Handle JWT verification errors
		return next(new ErrorHandler("Invalid Token", 401));
	}
});

export function authorizeRoles(...roles) {
	return (req, res, next) => {
		if (!roles.includes(req.user.role)) {
			return next(
				new ErrorHandler(`Role: ${req.user.role} is not allowed`, 403)
			);
		}
		next();
	};
}
