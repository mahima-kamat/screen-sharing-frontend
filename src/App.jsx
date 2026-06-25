import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";



export default function App() {
  const [roomId, setRoomId] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [isSecure, setIsSecure] = useState(true);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const socketRef = useRef(null);
  const peerConnection = useRef(null);
  const localStream = useRef(null);
  const isNegotiating = useRef(false);
  const iceCandidatesQueue = useRef([]);

  const roomIdRef = useRef(roomId);
  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    setIsSecure(window.isSecureContext);
    return () => {
      if (peerConnection.current) peerConnection.current.close();
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  const initPeerConnection = (socket) => {
peerConnection.current = new RTCPeerConnection({
  iceTransportPolicy: "relay",

  iceServers: [
    {
      urls: "stun:global.stun.twilio.com:3478",
    },
    {
      urls: [
        "turn:global.relay.metered.ca:80",
        "turn:global.relay.metered.ca:80?transport=tcp",
        "turn:global.relay.metered.ca:443",
        "turns:global.relay.metered.ca:443?transport=tcp",
      ],
      username: "YOUR_USERNAME",
      credential: "YOUR_PASSWORD",
    },
  ],
});

  peerConnection.current.onicecandidate = (event) => {
    if (event.candidate) {
      console.log("Sending ICE candidate");

      socket.emit("ice-candidate", {
        roomId: roomIdRef.current,
        candidate: event.candidate,
      });
    }
  };

peerConnection.current.ontrack = (event) => {
  console.log("Remote track received");

  const [stream] = event.streams;

  console.log("STREAM:", stream);

  if (remoteVideoRef.current) {
    remoteVideoRef.current.srcObject = stream;

    setTimeout(() => {
      remoteVideoRef.current
        .play()
        .then(() => {
          console.log("VIDEO PLAYING");
        })
        .catch((err) => {
          console.log("PLAY ERROR:", err);
        });
    }, 500);
  }
};

  peerConnection.current.onconnectionstatechange = () => {
    console.log(
      "Connection State:",
      peerConnection.current.connectionState
    );
  };

  peerConnection.current.oniceconnectionstatechange = () => {
    console.log(
      "ICE State:",
      peerConnection.current.iceConnectionState
    );
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

    socket.on("offer", async (offer) => {
      if (isNegotiating.current) return;
      isNegotiating.current = true;
      try {
        if (!peerConnection.current || peerConnection.current.signalingState !== "stable") return;
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.current.createAnswer();
        await peerConnection.current.setLocalDescription(answer);

        socket.emit("answer", { roomId: roomIdRef.current, answer });

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

    socket.on("answer", async (answer) => {
      try {
        if (peerConnection.current && peerConnection.current.signalingState === "have-local-offer") {
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));

          for (const candidate of iceCandidatesQueue.current) {
            await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
          }
          iceCandidatesQueue.current = [];
        }
      } catch (err) {
        console.error("Answer error:", err);
      }
    });

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

    socket.on("screen-share-stopped", () => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
    });
  };

  const shareScreen = async () => {
    if (!isSecure) {
      alert("Screen sharing is blocked on insecure connections. Please use localhost or HTTPS.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      localStream.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      stream.getVideoTracks()[0].onended = () => {
        stopShareScreen();
      };

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

  const stopShareScreen = () => {
    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => track.stop());
      localStream.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (socketRef.current) {
      socketRef.current.emit("screen-share-stopped", { roomId: roomIdRef.current });
    }
  };

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>Screen Sharing App</h1>

      {!isSecure && (
        <div style={{ color: "red", marginBottom: "20px", fontWeight: "bold" }}>
          ⚠️ Warning: Screen sharing is disabled on insecure connections (HTTP). You must use localhost or HTTPS.
        </div>
      )}

      <div style={{ marginBottom: "20px" }}>
        <input
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          placeholder="Room ID"
          style={{ padding: "8px", marginRight: "8px" }}
        />
        <button 
          onClick={joinRoom} 
          disabled={isJoined}
          style={{ padding: "8px 12px", cursor: "pointer" }}
        >
          {isJoined ? "Joined Room" : "Join Room"}
        </button>
      </div>

      {isJoined && (
        <button 
          onClick={shareScreen} 
          style={{ padding: "8px 12px", marginBottom: "20px", display: "block", cursor: "pointer" }}
        >
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
            style={{ width: "400px", height: "300px", border: "2px solid black", backgroundColor: "#222" }}
          />
        </div>
        <div>
          <h3>Received Screen</h3>
          <video
  ref={remoteVideoRef}
  autoPlay
  playsInline
  muted
  style={{
    width: "400px",
    height: "300px",
    backgroundColor: "black",
    border: "2px solid black",
  }}
/>
        </div>
      </div>
    </div>
  );
}
