import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

export default function App() {
  const [roomId, setRoomId] = useState("");
  const [joined, setJoined] = useState(false);

  const socketRef = useRef(null);
  const pcRef = useRef(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // ================= SOCKET CONNECT =================
  useEffect(() => {
    socketRef.current = io(
      "https://screensharebackend-1.onrender.com",
      {
        transports: ["websocket", "polling"]
      }
    );

    socketRef.current.on("connect", () => {
      console.log("✅ Socket Connected");
    });

    // ================= OFFER =================
    socketRef.current.on("offer", async (offer) => {
      console.log("📩 Offer Received");

      await createPeer(true);

      await pcRef.current.setRemoteDescription(
        new RTCSessionDescription(offer)
      );

      const answer = await pcRef.current.createAnswer();

      await pcRef.current.setLocalDescription(answer);

      socketRef.current.emit("answer", {
        roomId,
        answer
      });
    });

    // ================= ANSWER =================
    socketRef.current.on("answer", async (answer) => {
      console.log("📩 Answer Received");

      await pcRef.current.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
    });

    // ================= ICE =================
    socketRef.current.on(
      "ice-candidate",
      async ({ candidate }) => {
        try {
          if (candidate) {
            await pcRef.current.addIceCandidate(
              new RTCIceCandidate(candidate)
            );
          }
        } catch (err) {
          console.log("ICE Error:", err);
        }
      }
    );

    return () => {
      socketRef.current?.disconnect();
      pcRef.current?.close();
    };
  }, []);

  // ================= JOIN ROOM =================
  const joinRoom = () => {
    if (!roomId) {
      alert("Enter Room ID");
      return;
    }

    socketRef.current.emit("join-room", roomId);

    setJoined(true);

    console.log("🏠 Joined Room:", roomId);
  };

  // ================= CREATE PEER =================
  const createPeer = async (isReceiver = false) => {
    if (pcRef.current) return;

    pcRef.current = new RTCPeerConnection({
      iceServers: [
        // STUN
        {
          urls: "stun:stun.relay.metered.ca:80"
        },

        // TURN
        {
          urls: "turn:global.relay.metered.ca:80",
          username: "YOUR_USERNAME",
          credential: "YOUR_PASSWORD"
        },
        {
          urls:
            "turn:global.relay.metered.ca:80?transport=tcp",
          username: "YOUR_USERNAME",
          credential: "YOUR_PASSWORD"
        },
        {
          urls: "turn:global.relay.metered.ca:443",
          username: "YOUR_USERNAME",
          credential: "YOUR_PASSWORD"
        },
        {
          urls:
            "turns:global.relay.metered.ca:443?transport=tcp",
          username: "YOUR_USERNAME",
          credential: "YOUR_PASSWORD"
        }
      ]
    });

    // RECEIVER MODE
    if (isReceiver) {
      pcRef.current.addTransceiver("video", {
        direction: "recvonly"
      });

      pcRef.current.addTransceiver("audio", {
        direction: "recvonly"
      });
    }

    // ================= ICE SEND =================
    pcRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit("ice-candidate", {
          roomId,
          candidate: event.candidate
        });
      }
    };

    // ================= REMOTE TRACK =================
    pcRef.current.ontrack = (event) => {
      console.log("🎥 TRACK RECEIVED");

      const stream = event.streams[0];

      if (stream) {
        remoteVideoRef.current.srcObject = stream;

        remoteVideoRef.current
          .play()
          .catch((err) =>
            console.log("Play Error:", err)
          );
      }
    };

    // ================= DEBUG =================
    pcRef.current.onconnectionstatechange = () => {
      console.log(
        "🔌 Connection State:",
        pcRef.current.connectionState
      );
    };

    pcRef.current.oniceconnectionstatechange = () => {
      console.log(
        "🧊 ICE State:",
        pcRef.current.iceConnectionState
      );
    };
  };

  // ================= SHARE SCREEN =================
  const shareScreen = async () => {
    if (!roomId) {
      alert("Enter Room ID");
      return;
    }

    await createPeer(false);

    const stream =
      await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      });

    localVideoRef.current.srcObject = stream;

    // REMOVE OLD TRACKS
    const senders = pcRef.current.getSenders();

    senders.forEach((sender) => {
      pcRef.current.removeTrack(sender);
    });

    // ADD NEW TRACKS
    stream.getTracks().forEach((track) => {
      pcRef.current.addTrack(track, stream);
    });

    // CREATE OFFER
    const offer = await pcRef.current.createOffer();

    await pcRef.current.setLocalDescription(offer);

    socketRef.current.emit("offer", {
      roomId,
      offer
    });

    console.log("📤 Offer Sent");
  };

  // ================= UI =================
  return (
    <div style={{ padding: "20px" }}>
      <h2>Screen Sharing App</h2>

      <input
        type="text"
        placeholder="Enter Room ID"
        value={roomId}
        onChange={(e) =>
          setRoomId(e.target.value)
        }
        style={{
          padding: "10px",
          width: "250px"
        }}
      />

      <br />
      <br />

      <button
        onClick={joinRoom}
        style={{
          padding: "10px 20px",
          marginRight: "10px"
        }}
      >
        Join Room
      </button>

      <button
        onClick={shareScreen}
        style={{
          padding: "10px 20px"
        }}
      >
        Share Screen
      </button>

      <p>
        Status:{" "}
        {joined
          ? "🟢 Joined Room"
          : "🔴 Not Joined"}
      </p>

      <div
        style={{
          display: "flex",
          gap: "20px",
          marginTop: "20px"
        }}
      >
        <div>
          <h3>Local Screen</h3>

          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            width="400"
            style={{
              border: "2px solid black"
            }}
          />
        </div>

        <div>
          <h3>Remote Screen</h3>

          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            controls={false}
            width="400"
            style={{
              border: "2px solid black"
            }}
          />
        </div>
      </div>
    </div>
  );
}