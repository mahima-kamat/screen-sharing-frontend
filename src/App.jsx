import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

export default function App() {
  const [roomId, setRoomId] = useState("");
  const [isJoined, setIsJoined] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const socketRef = useRef(null);
  const peerConnection = useRef(null);
  const localStream = useRef(null);

  const iceCandidatesQueue = useRef([]);

  // Keep latest roomId available everywhere
  const roomIdRef = useRef(roomId);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (peerConnection.current) {
        peerConnection.current.close();
      }

      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // ================= PEER CONNECTION =================
  const initPeerConnection = async (socket) => {
    // Prevent duplicate active peer
    if (
      peerConnection.current &&
      peerConnection.current.connectionState !== "closed"
    ) {
      return;
    }

    // 🔥 Dynamic TURN credentials
    const response = await fetch(
      "https://mahima.metered.live/api/v1/turn/credentials?apiKey=4ee7b1423093d1185a6a7b5b664020165c01"
    );

    const iceServers = await response.json();

    console.log("ICE SERVERS:", iceServers);

    peerConnection.current = new RTCPeerConnection({
      iceServers,
    });

    // Receiver expects media
    peerConnection.current.addTransceiver("video", {
      direction: "recvonly",
    });

    peerConnection.current.addTransceiver("audio", {
      direction: "recvonly",
    });

    // ================= ICE =================
    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit("ice-candidate", {
          roomId: roomIdRef.current,
          candidate: event.candidate,
        });
      }
    };

    // ================= REMOTE STREAM =================
    peerConnection.current.ontrack = (event) => {
      console.log("🎥 TRACK RECEIVED");

      const [stream] = event.streams;

      if (stream && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;

        remoteVideoRef.current
          .play()
          .catch((err) =>
            console.log("Play Error:", err)
          );
      }
    };

    // ================= DEBUG =================
    peerConnection.current.onconnectionstatechange =
      () => {
        console.log(
          "🔌 Connection:",
          peerConnection.current.connectionState
        );
      };

    peerConnection.current.oniceconnectionstatechange =
      () => {
        console.log(
          "🧊 ICE:",
          peerConnection.current.iceConnectionState
        );
      };

    peerConnection.current.onicecandidateerror = (
      e
    ) => {
      console.log("ICE ERROR:", e);
    };
  };

  // ================= JOIN ROOM =================
  const joinRoom = async () => {
    if (!roomId) {
      return alert("Please enter Room ID");
    }

    const socket = io(
      "https://screensharebackend-6fat.onrender.com",
      {
        transports: ["websocket", "polling"],
      }
    );

    socketRef.current = socket;

    socket.on("connect", async () => {
      console.log("✅ Connected");

      // 🔥 CREATE PEER IMMEDIATELY
      await initPeerConnection(socket);

      socket.emit("join-room", roomId);

      setIsJoined(true);

      console.log("🏠 Joined Room:", roomId);
    });

    socket.on("connect_error", () => {
      alert("Failed to connect to signaling server");
    });

    // ================= OFFER =================
    socket.on("offer", async (offer) => {
      try {
        console.log("📩 Offer received");

        await peerConnection.current.setRemoteDescription(
          new RTCSessionDescription(offer)
        );

        const answer =
          await peerConnection.current.createAnswer();

        await peerConnection.current.setLocalDescription(
          answer
        );

        socket.emit("answer", {
          roomId: roomIdRef.current,
          answer,
        });

        // Add queued ICE candidates
        for (const candidate of iceCandidatesQueue.current) {
          await peerConnection.current.addIceCandidate(
            new RTCIceCandidate(candidate)
          );
        }

        iceCandidatesQueue.current = [];
      } catch (err) {
        console.error("Offer error:", err);
      }
    });

    // ================= ANSWER =================
    socket.on("answer", async (answer) => {
      try {
        console.log("📩 Answer received");

        await peerConnection.current.setRemoteDescription(
          new RTCSessionDescription(answer)
        );

        // Add queued ICE candidates
        for (const candidate of iceCandidatesQueue.current) {
          await peerConnection.current.addIceCandidate(
            new RTCIceCandidate(candidate)
          );
        }

        iceCandidatesQueue.current = [];
      } catch (err) {
        console.error("Answer error:", err);
      }
    });

    // ================= ICE RECEIVE =================
    socket.on("ice-candidate", async (candidate) => {
      try {
        if (
          peerConnection.current &&
          peerConnection.current.remoteDescription
        ) {
          await peerConnection.current.addIceCandidate(
            new RTCIceCandidate(candidate)
          );
        } else {
          iceCandidatesQueue.current.push(candidate);
        }
      } catch (err) {
        console.error("ICE error:", err);
      }
    });
  };

  // ================= SHARE SCREEN =================
  const shareScreen = async () => {
    try {
      const stream =
        await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });

      localStream.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Remove old tracks
      const senders =
        peerConnection.current.getSenders();

      senders.forEach((sender) => {
        peerConnection.current.removeTrack(sender);
      });

      // Add new tracks
      stream.getTracks().forEach((track) => {
        peerConnection.current.addTrack(track, stream);
      });

      const offer =
        await peerConnection.current.createOffer();

      await peerConnection.current.setLocalDescription(
        offer
      );

      socketRef.current.emit("offer", {
        roomId,
        offer,
      });

      console.log("📤 Offer sent");
    } catch (err) {
      console.error(
        "Screen share error:",
        err
      );
    }
  };

  // ================= UI =================
  return (
    <div style={{ padding: "20px" }}>
      <h1>Screen Sharing App</h1>

      <div style={{ marginBottom: "20px" }}>
        <input
          value={roomId}
          onChange={(e) =>
            setRoomId(e.target.value)
          }
          placeholder="Room ID"
          style={{
            padding: "10px",
            width: "250px",
          }}
        />

        <button
          onClick={joinRoom}
          disabled={isJoined}
          style={{
            marginLeft: "10px",
            padding: "10px 20px",
          }}
        >
          {isJoined
            ? "Joined Room"
            : "Join Room"}
        </button>
      </div>

      {isJoined && (
        <button
          onClick={shareScreen}
          style={{
            marginBottom: "20px",
            padding: "10px 20px",
          }}
        >
          Share Screen
        </button>
      )}

      <div
        style={{
          display: "flex",
          gap: "20px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h3>My Screen</h3>

          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            style={{
              width: "400px",
              height: "300px",
              border: "2px solid black",
            }}
          />
        </div>

        <div>
          <h3>Received Screen</h3>

          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            controls={false}
            style={{
              width: "400px",
              height: "300px",
              border: "2px solid black",
            }}
          />
        </div>
      </div>
    </div>
  );
}