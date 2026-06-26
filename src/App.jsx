import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

export default function App() {
  const [peerId, setPeerId] = useState("");

  const socketRef = useRef(null);
  const pcRef = useRef(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const userId = useRef(
    localStorage.getItem("userId") ||
    crypto.randomUUID()
  );

  localStorage.setItem("userId", userId.current);

  // CONNECT SOCKET
  const connect = () => {
    socketRef.current = io("https://screensharebackend-1.onrender.com"); // change to deployed URL

    socketRef.current.on("connect", () => {
      socketRef.current.emit("register", userId.current);
      initPeer();
      console.log("Connected");
    });

    // OFFER RECEIVED
    socketRef.current.on("offer", async ({ from, offer }) => {
      await pcRef.current.setRemoteDescription(offer);

      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);

      socketRef.current.emit("answer", {
        to: from,
        from: userId.current,
        answer
      });
    });

    // ANSWER RECEIVED
    socketRef.current.on("answer", async ({ answer }) => {
      await pcRef.current.setRemoteDescription(answer);
    });

    // ICE
    socketRef.current.on("ice-candidate", async ({ candidate }) => {
      if (candidate) {
        await pcRef.current.addIceCandidate(candidate);
      }
    });
  };

  // PEER CONNECTION
  const initPeer = () => {
    pcRef.current = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" }
      ]
    });

    pcRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit("ice-candidate", {
          to: peerId,
          from: userId.current,
          candidate: event.candidate
        });
      }
    };

    pcRef.current.ontrack = (event) => {
      remoteVideoRef.current.srcObject = event.streams[0];
    };
  };

  // SHARE SCREEN
  const shareScreen = async () => {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false
    });

    localVideoRef.current.srcObject = stream;

    stream.getTracks().forEach(track => {
      pcRef.current.addTrack(track, stream);
    });

    const offer = await pcRef.current.createOffer();
    await pcRef.current.setLocalDescription(offer);

    socketRef.current.emit("offer", {
      to: peerId,
      from: userId.current,
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
      <h2>Screen Share App</h2>

      <button onClick={connect}>Connect</button>

      <p>Your ID: {userId.current}</p>

      <input
        placeholder="Enter Peer ID"
        value={peerId}
        onChange={(e) => setPeerId(e.target.value)}
      />

      <button onClick={shareScreen}>
        Share Screen
      </button>

      <div style={{ display: "flex", gap: 20 }}>
        <video ref={localVideoRef} autoPlay muted width="300" />
        <video ref={remoteVideoRef} autoPlay width="300" />
      </div>
    </div>
  );
}