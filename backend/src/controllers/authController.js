import { User, Chat, Request } from "../models/index.js";
import { StatusCodes } from "http-status-codes";
import { BadRequest, NotFound, Unauthenticated } from "../errors/index.js";
import { cookieResponse, generateToken, emitEvent } from "../utils/index.js";
import { NEW_REQUEST } from "../constants/events.js";
import { getOtherMembers } from "../lib/helper.js";

const registerUser = async (req, res) => {
  // We use req.body to access the data sent by the client in the request body
  // IMPORTANT NOTE: req.body is used to access the data sent by the client in the request body, which is essential for operations like user registration.
  const { name, username, email, password, bio } = req.body;

  const emialAlreadyExists = await User.findOne({ email });
  if (emialAlreadyExists) {
    throw new BadRequest("Email already exists. Try with another");
  }

  const isFirstUser = (await User.countDocuments({})) === 0;
  const role = isFirstUser ? "admin" : "user";

  const avatar = {
    public_id: "sdfs",
    url: "asd",
  };

  const user = await User.create({
    name,
    username,
    email,
    role,
    bio,
    password,
    avatar,
  });

  // Extract necessary user data to be included in the JWT token payload
  const tokenUser = generateToken(user);
  // Generate a JWT token for the user and set it in an HTTP-only, secure cookie in the response
  cookieResponse({ res, user: tokenUser });
  res
    .status(StatusCodes.CREATED)
    .send({ success: true, user, message: "user created successfully" });
};

const loginUser = async (req, res) => {
  const { email, username, password } = req.body;

  const user = await User.findOne({
    $or: [{ email: email }, { username: username }],
  }).select("+password");

  if (!user) {
    throw new Unauthenticated(`Not foun a user with that ${email}`);
  }

  const isPasswordCorrect = await user.comparePassword(password);
  if (!isPasswordCorrect) {
    throw new Unauthenticated("Invalid Password, Please try again");
  }

  const tokenUser = generateToken(user);
  cookieResponse({ res, user: tokenUser });

  res.status(StatusCodes.OK).send({ user: tokenUser });
};
const logoutUser = async (req, res) => {
  return res
    .cookie("token", "", {
      httpOnly: true,
      secure: true,
      expires: new Date(0),
    })
    .json({
      message: "You have been logged out",
      sucess: true,
    });
};

const getUserProfile = async (req, res) => {
  const getUser = await User.findById(req.user);

  res.status(StatusCodes.OK).json({
    sucess: true,
    getUser,
  });
};

const searchUser = async (req, res) => {
  const { name = "" } = req.query;

  const allChats = await Chat.find({});

  if (!allChats || allChats.length === 0) {
    throw new BadRequest("No chats found");
  }

  // extracting All Users From my chats
  const allChatMembers = allChats.flatMap((chat) => chat.members);

  if (!allChatMembers || allChatMembers.length === 0) {
    throw new BadRequest("No Members found in chats");
  }

  // Query to find all users who are not already members of any chat the current user is also not part
  const findAllUsersExceptMeAndMyFriends = await User.find({
    _id: {
      //ensuring the search results are only new potential contacts or users the current user is not already connected with.
      $nin: allChatMembers,
    },
    name: { $regex: name, $options: "i" },
  });

  if (findAllUsersExceptMeAndMyFriends.length === 0) {
    throw new BadRequest("No Members found in chats");
  }

  const findUsersAvatar = findAllUsersExceptMeAndMyFriends.map(
    ({ _id, name, avatar }) => ({
      _id,
      name,
      avatar: avatar?.url || "No Avatar URL Found",
    })
  );

  if (!findUsersAvatar) {
    throw new BadRequest("No Avatar found in chats, please try again");
  }

  return res.status(StatusCodes.OK).json({
    sucess: true,
    findUsersAvatar,
  });
};

const sendFriendRequest = async (req, res) => {
  const { userId } = req.body;

  const alreadySendRequest = await Request.findOne({
    $or: [
      { sender: req.user, reciver: userId },
      { sender: userId, reciver: req.user },
    ],
  });
  if (alreadySendRequest) {
    throw new BadRequest("You have already sent a friend request");
  }

  await Request.create({
    sender: req.user,
    receiver: userId,
  });

  emitEvent(req, NEW_REQUEST, [userId]);

  return res.status(StatusCodes.OK).json({
    sucess: true,
    message: "Friend request sent successfully",
  });
};

const acceptFriendRequest = async (req, res) => {
  const { requestId, accept } = req.body;

  // Find the friend request by ID and populate sender and receiver details
  const request = await Request.findById(requestId)
    .populate("sender", "name")
    .populate("receiver", "name");

  if (!request) {
    throw new NotFound("Request not found");
  }

  if (request.receiver._id.toString() !== req.user.toString()) {
    throw new Unauthenticated("You are not authorized to accept this request");
  }

  // If the accept flag is false, delete the friend request
  if (!accept) {
    await request.deleteOne();
    return res.status(StatusCodes.OK).json({
      sucess: true,
      message: "Friend request declined successfully",
    });
  }

  // If the accept flag is true, create an array of members for the new chat means for both sender and receiver
  const members = [request.sender?._id, request.receiver?._id];

  // 1. Create a new chat with the sender and receiver as members
  // 2. Delete the friend request
  await Promise.all([
    Chat.create({
      members,
      name: `${request.sender.name}-${request.receiver.name}`,
    }),
    request.deleteOne(),
  ]);

  return res.status(StatusCodes.OK).json({
    success: true,
    message: "Friend request accepted and chat created successfully",
  });
};

const getAllNotifications = async (req, res) => {
  const requests = await Request.find({ receiver: req.user }).populate(
    "sender",
    "name avatar"
  );

  if (!requests) {
    throw new NotFound("No requests found");
  }

  const allRequests = requests.map(({ _id, sender }) => ({
    _id,
    sender: {
      _id: sender._id,
      name: sender.name,
      avatar: sender.avatar?.url || "No Avatar URL Found",
    },
  }));

  return res.status(StatusCodes.OK).json({
    sucess: true,
    allRequests,
  });
};

// TODO: We face some issues in this function, later we should correct them!
const getMyAllFriends = async (req, res) => {
  const chatId = req.query.chatId;

  // Fetch all direct (one-on-one) chats involving the current user
  const chats = await Chat.find({
    members: req.user,
    groupChat: false,
  }).populate("members", "name avatar");

  if (!chats || chats.length === 0) {
    throw new NotFound("No chats found");
  }

  // The map function iterates over each chat (chats) and extracts the other member (friend) of each chat, excluding the current user.
  const friends = chats.map(({ members }) => {
    const otherUsers = getOtherMembers(members, req.user);

    // Create a friend object with necessary details
    return {
      _id: otherUsers._id,
      name: otherUsers.name,
      avatar: otherUsers.avatar?.url || "No Avatar URL Found",
    };
  });

  if (friends.length === 0) {
    throw new NotFound("No friends found");
  }

  // If chatId is provided, filter out friends who are already members of the specified chat
  if (chatId) {
    const chat = await Chat.findById(chatId);

    // include those friends who are not members of the specified chat
    const availableFriends = friends.filter(
      (friend) => !chat.members.includes(friend?._id)
    );
    return res.status(StatusCodes.OK).json({
      sucess: true,
      friends: availableFriends,
    });
  } else {
    return res.status(StatusCodes.OK).json({
      sucess: true,
      friends,
    });
  }
};

export {
  loginUser,
  registerUser,
  logoutUser,
  getUserProfile,
  searchUser,
  sendFriendRequest,
  acceptFriendRequest,
  getAllNotifications,
  getMyAllFriends,
};
