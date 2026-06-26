import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

export default function App() {
  const [peerId, setPeerId] = useState("");
  const [connected, setConnected] = useState(false);

  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // unique user id per device/tab
  const userIdRef = useRef(
    localStorage.getItem("userId") ||
      (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()))
  );

  localStorage.setItem("userId", userIdRef.current);

  // =========================
  // CONNECT SOCKET
  // =========================
  const connect = () => {
    const socket = io("https://screensharebackend-6fat.onrender.com");

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Connected:", socket.id);

      // register user
      socket.emit("register", userIdRef.current);
      setConnected(true);

      initPeer();
    });

    // =========================
    // OFFER RECEIVED
    // =========================
    socket.on("offer", async ({ from, offer }) => {
      console.log("Offer from:", from);

      await pcRef.current.setRemoteDescription(offer);

      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);

      socket.emit("answer", {
        to: from,
        from: userIdRef.current,
        answer,
      });
    });

    // =========================
    // ANSWER RECEIVED
    // =========================
    socket.on("answer", async ({ answer }) => {
      console.log("Answer received");
      await pcRef.current.setRemoteDescription(answer);
    });

    // =========================
    // ICE CANDIDATES
    // =========================
    socket.on("ice-candidate", async ({ candidate }) => {
      try {
        if (candidate) {
          await pcRef.current.addIceCandidate(candidate);
        }
      } catch (err) {
        console.log("ICE error:", err);
      }
    });
  };

  // =========================
  // PEER CONNECTION
  // =========================
  const initPeer = () => {
    pcRef.current = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" }
      ],
    });

    // send ICE to remote peer
    pcRef.current.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit("ice-candidate", {
          to: peerId,
          from: userIdRef.current,
          candidate: event.candidate,
        });
      }
    };

    // receive remote stream
    pcRef.current.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };
  };

  // =========================
  // SHARE SCREEN
  // =========================
  const shareScreen = async () => {
    if (!peerId) {
      alert("Enter peer ID first");
      return;
    }

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });

    localStreamRef.current = stream;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    // add tracks
    stream.getTracks().forEach((track) => {
      pcRef.current.addTrack(track, stream);
    });

    const offer = await pcRef.current.createOffer();
    await pcRef.current.setLocalDescription(offer);

    socketRef.current.emit("offer", {
      to: peerId,
      from: userIdRef.current,
      offer,
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
      <h2>Screen Sharing App</h2>

      <button onClick={connect}>
        {connected ? "Connected" : "Connect"}
      </button>

      <p>Your ID: <b>{userIdRef.current}</b></p>

      <input
        placeholder="Enter peer ID"
        value={peerId}
        onChange={(e) => setPeerId(e.target.value)}
      />

      <button onClick={shareScreen} style={{ marginLeft: 10 }}>
        Share Screen
      </button>

      <div style={{ display: "flex", gap: 20, marginTop: 20 }}>
        <div>
          <h4>Local Screen</h4>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            style={{ width: 300, border: "1px solid black" }}
          />
        </div>

        <div>
          <h4>Remote Screen</h4>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{ width: 300, border: "1px solid black" }}
          />
        </div>
      </div>
    </div>
  );
}