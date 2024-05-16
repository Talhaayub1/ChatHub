import React from "react";
import { Stack } from "@mui/material";
import ChatItem from "../shared/ChatItem";

const ChatList = ({
  w = "100%",
  chats = [],
  chatId,
  onlineUsers = [],
  newMessagesAert = [
    {
      chatId: "1",
      count: 0,
    },
  ],
  handleDeleteChat,
}) => {
  return (
    <Stack width={w} direction={"column"}>
      {chats?.map((data, index) => {
        const { avatar, _id, name, groupChat, memebers } = data;

        const newMessageAlert = newMessagesAert.find(
          ({ chatId }) => chatId === _id
        );

        const isOnline = memebers?.some((member) => onlineUsers.includes(_id));

        return (
          <ChatItem
            index={index}
            newMessageAlert={newMessageAlert}
            isOnline={onlineUsers}
            avatar={avatar}
            name={name}
            _id={_id}
            key={_id}
            groupChat={groupChat}
            sameSender={chatId === _id}
            handleDeleteChat={handleDeleteChat}
          />
        );
      })}
    </Stack>
  );
};

export default ChatList;
