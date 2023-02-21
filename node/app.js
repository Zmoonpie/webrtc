var express = require("express");
var app = express();
const { hSet, hGetAll, hDel } = require("./redis");
const { getMsg, getParams } = require("./common");

const httpServer = require("http").createServer(app);
const io = require("socket.io")(httpServer, { allowEIO3: true });
const roomKey = "meeting-room::";
const userMap = new Map(); // user - > socket

io.on("connection", async (socket) => {
  // socket.emit('msg',socket)
  await onListen(socket);
});
io.on("error", (err) => {
  console.log(err);
});

httpServer.listen(3000, () => {
  console.log("服务器启动成功 *:3000");
});

async function getUserDetailByUid(userId, roomId) {
  let res = JSON.stringify({ userId: userId, roomId: roomId });
  console.log(res);
  return res;
}

function oneToOne(uid, msg) {
  let s = userMap.get(uid);
  if (s) {
    s.emit("msg", msg);
  } else {
    console.log(uid + "用户不在线");
  }
}

async function oneToRoomMany(roomId, msg) {
  let ulist = await hGetAll(roomKey + roomId);
  for (const uid in ulist) {
    oneToOne(uid, msg);
  }
}

async function getRoomUser(roomId) {
  let ulist = await hGetAll(roomKey + roomId);
  return ulist;
}

async function onListen(s) {
  let url = s.client.request.url;
  let userId = getParams(url, "userId");
  let roomId = getParams(url, "roomId");
  console.log("client uid：" + userId + " roomId: " + roomId + " online ");

  userMap.set(userId, s);

  if (roomId) {
    await hSet(
      roomKey + roomId,
      userId,
      await getUserDetailByUid(userId, roomId)
    );
    oneToRoomMany(roomId, getMsg("join", userId + " join then room"));
  }

  s.on("msg", async (data) => {
    console.log("msg", data);
    await oneToRoomMany(roomId);
  });

  s.on("disconnect", () => {
    console.log("client uid：" + userId + " roomId: " + roomId + " offline ");
    userMap.delete(userId);
    if (roomId) {
      redisClient.hDel(roomKey + roomId, userId);
      oneToRoomMany(roomId, getMsg("leave", userId + " leave the room "));
    }
  });

  s.on("roomUserList", async (data) => {
    // console.log("roomUserList msg",data)
    s.emit("roomUserList", await getRoomUser(data["roomId"]));
  });
  s.on("call", (data) => {
    let targetUid = data["targetUid"];
    if (userMap.get(targetUid)) {
      oneToOne(targetUid, getMsg("call", "远程呼叫", 200, data));
    } else {
      console.log(targetUid + "不在线");
    }
  });
  s.on("candidate", (data) => {
    let targetUid = data["targetUid"];
    if (userMap.get(targetUid)) {
      oneToOne(targetUid, getMsg("candidate", "ice candidate", 200, data));
    } else {
      console.log(targetUid + "不在线"); 
    }
  });
  s.on("offer", (data) => {
    let targetUid = data["targetUid"];
    if (userMap.get(targetUid)) {
      oneToOne(targetUid, getMsg("offer", "rtc offer", 200, data));
    } else {
      console.log(targetUid + "不在线");
    }
  });
  s.on("answer", (data) => {
    let targetUid = data["targetUid"];
    if (userMap.get(targetUid)) {
      oneToOne(targetUid, getMsg("answer", "rtc answer", 200, data));
    } else {
      console.log(targetUid + "不在线");
    }
  });
}
