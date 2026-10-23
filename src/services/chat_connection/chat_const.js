"use strict";

/**
 * Chat server protocol constants (mirrors Go service/chat_connection/chat_const.go).
 */

const OPChatPrivate = 1;
const OPFriendApply = 2;
const OPFriendDelete = 4;
const OPGroupChat = 5;
const OPFriendReply = 5;
const OPGroupFriend = 6;
const OPFriendList = 7;
const OPChatGroup = 48;

const OPLoginOnOtherDevice = 259;
const OPBanLogin = 260;
const OPBanChat = 32784;
const OPBanItem = 32785;

const OPFriendOnline = 10000;
const OPFriendOnline2 = 10021;
const OPSetBlockDelete = 10022;
const OPPushFriendApply = 10001;
const OPPushFriendReply = 10002;
const OPPushFriendDelete = 10003;
const OPPushFriendList = 10005;
const OPPlayerLeaveRoom = 10242;
const OPAIRemainCount = 10248;
const OPCloseFriendOnline = 10027;

const ShareTypeText = 0;
const ShareTypeAudio = 1;
const ShareTypeLanGame = 2;
const ShareTypeServerGame = 3;
const ShareTypeVoiceRoom = 4;
const ShareTypeNotice = 5;
const ShareTypeNews = 6;
const ShareTypeProfile = 7;
const ShareTypeResource = 8;
const ShareTypeCategory = 9;
const ShareTypeRentGame = 10;
const ShareTypeLobbyGame = 11;
const ShareTypeCPPLanGame = 12;
const ShareTypeHomeland = 13;
const ShareTypeLaXin = 14;
const ShareTypeNetGame = 15;
const ShareTypeInvite = 16;
const ShareTypeClaim = 102;
const ShareTypeDonate = 103;
const ShareTypeActivity = 200;

const CommandChatPrivate = ((OPGroupChat << 8) | OPChatPrivate) & 0xffff;
const CommandChatGroup = ((OPGroupChat << 8) | OPChatGroup) & 0xffff;

module.exports = {
  OPChatPrivate,
  OPFriendApply,
  OPFriendDelete,
  OPGroupChat,
  OPFriendReply,
  OPGroupFriend,
  OPFriendList,
  OPChatGroup,
  OPLoginOnOtherDevice,
  OPBanLogin,
  OPBanChat,
  OPBanItem,
  OPFriendOnline,
  OPFriendOnline2,
  OPSetBlockDelete,
  OPPushFriendApply,
  OPPushFriendReply,
  OPPushFriendDelete,
  OPPushFriendList,
  OPPlayerLeaveRoom,
  OPAIRemainCount,
  OPCloseFriendOnline,
  ShareTypeText,
  ShareTypeAudio,
  ShareTypeLanGame,
  ShareTypeServerGame,
  ShareTypeVoiceRoom,
  ShareTypeNotice,
  ShareTypeNews,
  ShareTypeProfile,
  ShareTypeResource,
  ShareTypeCategory,
  ShareTypeRentGame,
  ShareTypeLobbyGame,
  ShareTypeCPPLanGame,
  ShareTypeHomeland,
  ShareTypeLaXin,
  ShareTypeNetGame,
  ShareTypeInvite,
  ShareTypeClaim,
  ShareTypeDonate,
  ShareTypeActivity,
  CommandChatPrivate,
  CommandChatGroup,
};
