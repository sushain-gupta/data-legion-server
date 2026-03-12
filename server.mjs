import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import errorMiddleware from "./middlewares/error.mjs";
import user from "./routes/userRoute.mjs";
import voter from "./routes/voterRoute.mjs";
import survey from "./routes/surveyRoute.mjs";
import csv from "./routes/csvDownloadRoute.mjs";
import script from "./routes/scriptRoute.mjs";
import mongoose from "mongoose";

dotenv.config();
const app = express();

app.get("/health", (req, res) => res.send("ok"));

// Middleware to handle CORS
app.use((req, res, next) => {
	cors({
		origin: function (origin, callback) {
			if (process.env.ORIGIN.includes(origin)) {
				callback(null, true);
			} else {
				if (req.path === "/health") {
					res.status(200).end();
				} else {
					callback(new Error("Not allowed by CORS"));
				}
			}
		},
		credentials: true,
		methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
		exposedHeaders: ["Set-Cookie", "Date", "ETag"],
	})(req, res, next);
});

app.use(express.json({ limit: "200mb" }));
app.use(express.urlencoded({ limit: "200mb", extended: true }));
app.use(cookieParser());

app.use("/api/user", user);
app.use("/api/voter", voter);
app.use("/api/csvData", csv);
app.use("/api/survey", survey);
app.use("/api/scripts", script);

// if (process.env.NODE_ENV !== "production") {
// 	app.get("/", (req, res) => {
// 		res.send("Server is Running! 🚀");
// 	});
// }

// Error Middleware
app.use(errorMiddleware);

const PORT = process.env.PORT || 4000;

// UncaughtException Error
process.on("uncaughtException", (err) => {
	console.log(`Error: ${err.message}`);
	process.exit(1);
});

mongoose
	.connect(process.env.MONGO_URI)
	.then(() => console.log("🗄️ Mongo Connected"))
	.catch((err) => console.log(err));

app.get("/", (req, res) => {
	res.json(`Server Connected 🚀`);
});

const server = app.listen(PORT, () => {
	console.log(`🚀 Server is running on http://localhost:${PORT}`);
});

// Unhandled Promise Rejection
process.on("unhandledRejection", (err) => {
	console.log(`Error: ${err.message}`);
	server.close(() => {
		process.exit(1);
	});
});
