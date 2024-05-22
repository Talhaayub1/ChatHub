import mongoose from "mongoose";
import DB_NAME from "../constant.js";

const connectDB = async () => {
  try {
    const connectionInstance = await mongoose.connect(
      `${process.env.MONGO_URI}/${DB_NAME}`
    );
    console.log(
      `/n MongoDB Connected to !! DB HOST: ${connectionInstance.connection.host}`
    );
  } catch (error) {
    console.log("Connection Error While Connecting to Database", error.message);
    process.exit(1);
  }
};

export default connectDB;
