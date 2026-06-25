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
  const isNegotiating = useRef(false);
  const iceCandidatesQueue = useRef([]);

  // Ref keeps the latest roomId accessible to useEffect event listeners
  const roomIdRef = useRef(roomId);
  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (peerConnection.current) peerConnection.current.close();
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  const initPeerConnection = (socket) => {
    peerConnection.current = new RTCPeerConnection({
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelay",
    },
  ],
});

    // Send local ICE candidates to the remote peer
    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit("ice-candidate", {
          roomId: roomIdRef.current,
          candidate: event.candidate,
        });
      }
    };

    // Listen for incoming remote stream tracks
    peerConnection.current.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
    };
  };

  const joinRoom = () => {
    if (!roomId) return alert("Please enter a Room ID");

    const socket = io("https://screensharebackend-6fat.onrender.com");
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join-room", roomId);
      setIsJoined(true);
      initPeerConnection(socket);
    });

    socket.on("connect_error", () => {
      alert("Failed to connect to signaling server");
    });

    // Offer Handler (Receiver side)
    socket.on("offer", async (offer) => {
      if (isNegotiating.current) return;
      isNegotiating.current = true;
      try {
        if (peerConnection.current.signalingState !== "stable") return;
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.current.createAnswer();
        await peerConnection.current.setLocalDescription(answer);

        socket.emit("answer", { roomId: roomIdRef.current, answer });

        // Add early ICE candidates
        for (const candidate of iceCandidatesQueue.current) {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
        iceCandidatesQueue.current = [];
      } catch (err) {
        console.error("Offer error:", err);
      } finally {
        isNegotiating.current = false;
      }
    });

    // Answer Handler (Sender side)
    socket.on("answer", async (answer) => {
      try {
        if (peerConnection.current.signalingState === "have-local-offer") {
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));

          // Add early ICE candidates
          for (const candidate of iceCandidatesQueue.current) {
            await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
          }
          iceCandidatesQueue.current = [];
        }
      } catch (err) {
        console.error("Answer error:", err);
      }
    });

    // ICE Candidate Handler
    socket.on("ice-candidate", async (candidate) => {
      try {
        if (peerConnection.current && peerConnection.current.remoteDescription) {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          iceCandidatesQueue.current.push(candidate);
        }
      } catch (err) {
        console.error("ICE error:", err);
      }
    });
  };

  const shareScreen = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      localStream.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      stream.getTracks().forEach((track) => {
        peerConnection.current.addTrack(track, stream);
      });

      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);

      socketRef.current.emit("offer", { roomId, offer });
    } catch (err) {
      console.error("Screen share error:", err);
    }
  };

  return (
    <div style={{ padding: "20px" }}>
      <h1>Screen Sharing App</h1>

      <div style={{ marginBottom: "20px" }}>
        <input
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          placeholder="Room ID"
        />
        <button onClick={joinRoom} disabled={isJoined}>
          {isJoined ? "Joined Room" : "Join Room"}
        </button>
      </div>

      {isJoined && (
        <button onClick={shareScreen} style={{ marginBottom: "20px", display: "block" }}>
          Share Screen
        </button>
      )}

      <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
        <div>
          <h3>My Screen</h3>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            style={{ width: "400px", height: "300px", border: "2px solid black" }}
          />
        </div>
        <div>
          <h3>Received Screen</h3>
          <video
            ref={remoteVideoRef}
            autoPlay
            muted
            playsInline
            style={{ width: "400px", height: "300px", border: "2px solid black" }}
          />
        </div>
      </div>
    </div>
  );
}
