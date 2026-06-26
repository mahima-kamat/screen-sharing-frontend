import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

export default function App() {
  const [roomId, setRoomId] = useState("");

  const socketRef = useRef(null);
  const pcRef = useRef(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // CONNECT SOCKET
  const connect = () => {
    socketRef.current = io("https://screensharebackend-1.onrender.com", {
      transports: ["websocket", "polling"]
    });

    socketRef.current.on("connect", () => {
      console.log("Connected:", socketRef.current.id);
    });

    // OFFER RECEIVED
    socketRef.current.on("offer", async ({ from, offer }) => {
      await initPeer();

      await pcRef.current.setRemoteDescription(offer);

      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);

      socketRef.current.emit("answer", {
        roomId,
        answer
      });
    });

    // ANSWER RECEIVED
    socketRef.current.on("answer", async ({ answer }) => {
      await pcRef.current.setRemoteDescription(answer);
    });

    // ICE CANDIDATE
    socketRef.current.on("ice-candidate", async ({ candidate }) => {
      try {
        if (candidate) {
          await pcRef.current.addIceCandidate(candidate);
        }
      } catch (err) {
        console.log("ICE error:", err);
      }
    });
  };

  // JOIN ROOM
  const joinRoom = () => {
    if (!roomId) return alert("Enter Room ID");

    socketRef.current.emit("join-room", roomId, (res) => {
      console.log("Joined room:", res);
      initPeer();
    });
  };

  // INIT PEER CONNECTION
  const initPeer = async () => {
    if (pcRef.current) return;

    pcRef.current = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" }
      ]
    });

    // SEND ICE
    pcRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit("ice-candidate", {
          roomId,
          candidate: event.candidate
        });
      }
    };

    // RECEIVE STREAM
    pcRef.current.ontrack = (event) => {
      remoteVideoRef.current.srcObject = event.streams[0];
    };
  };

  // SHARE SCREEN
  const shareScreen = async () => {
    if (!roomId) return alert("Enter Room ID");

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false
    });

    localVideoRef.current.srcObject = stream;

    stream.getTracks().forEach((track) => {
      pcRef.current.addTrack(track, stream);
    });

    const offer = await pcRef.current.createOffer();
    await pcRef.current.setLocalDescription(offer);

    socketRef.current.emit("offer", {
      roomId,
      offer
    });
  };

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
      pcRef.current?.close();
    };
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2>Room Based Screen Share</h2>

      <button onClick={connect}>Connect</button>

      <br /><br />

      <input
        placeholder="Enter Room ID"
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
      />

      <button onClick={joinRoom}>Join Room</button>

      <button onClick={shareScreen}>Share Screen</button>

      <div style={{ display: "flex", gap: 20, marginTop: 20 }}>
        <div>
          <h4>Local Screen</h4>
          <video ref={localVideoRef} autoPlay muted width="300" />
        </div>

        <div>
          <h4>Remote Screen</h4>
          <video ref={remoteVideoRef} autoPlay width="300" />
        </div>
      </div>
    </div>
  );
}