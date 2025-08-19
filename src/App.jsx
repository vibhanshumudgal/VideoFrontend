import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const SIGNALING_SERVER_URL = "http://localhost:4000";
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

export default function App() {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const socketRef = useRef(null);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    return () => {
      leaveRoom();
    };
  }, []);

  async function startLocalMedia() {
    if (localStreamRef.current) return localStreamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
       audio: {
    echoCancellation: false,
    noiseSuppression: false
  }
      });
      localStreamRef.current = stream;
      localVideoRef.current.srcObject = stream;
      return stream;
    } catch (err) {
      console.error("getUserMedia error", err);
      alert("Could not access camera/microphone: " + err.message);
      throw err;
    }
  }

  function createPeerConnection(remoteSocketId) {
    peerConnectionRef.current = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
    });

    peerConnectionRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit("ice-candidate", {
          to: remoteSocketId,
          from: socketRef.current.id,
          candidate: event.candidate,
        });
      }
    };

    peerConnectionRef.current.ontrack = (event) => {
      remoteVideoRef.current.srcObject = event.streams[0];
    };

    return peerConnectionRef.current;
  }

  async function joinRoom() {
    await startLocalMedia();
    socketRef.current = io(SIGNALING_SERVER_URL, { transports: ["websocket"] });

    socketRef.current.on("connect", () => {
      console.log("Connected as", socketRef.current.id);
      socketRef.current.emit("join-room", { roomId: "12345" });
      setJoined(true);
    });

    // if another peer is already in the room, create offer
    socketRef.current.on("other-user", async ({ socketId }) => {
      console.log("Other user:", socketId);
      const pc = createPeerConnection(socketId);
      localStreamRef.current
        .getTracks()
        .forEach((track) => pc.addTrack(track, localStreamRef.current));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current.emit("offer", {
        to: socketId,
        from: socketRef.current.id,
        sdp: pc.localDescription,
      });
    });

    // incoming offer -> answer
    socketRef.current.on("offer", async ({ from, sdp }) => {
      const pc = createPeerConnection(from);
      localStreamRef.current
        .getTracks()
        .forEach((track) => pc.addTrack(track, localStreamRef.current));
      await pc.setRemoteDescription(sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current.emit("answer", {
        to: from,
        from: socketRef.current.id,
        sdp: pc.localDescription,
      });
    });

    // incoming answer
    socketRef.current.on("answer", async ({ sdp }) => {
      await peerConnectionRef.current.setRemoteDescription(sdp);
    });

    // incoming ICE
    socketRef.current.on("ice-candidate", async ({ candidate }) => {
      try {
        await peerConnectionRef.current.addIceCandidate(candidate);
      } catch (err) {
        console.error("Error adding ICE candidate", err);
      }
    });

    // other user left
    socketRef.current.on("user-left", () => {
      console.log("Peer disconnected");
      leaveRoom();
    });
  }

  function leaveRoom() {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setJoined(false);
  }

  function toggleMute() {
    if (localStreamRef.current) {
      localStreamRef.current
        .getAudioTracks()
        .forEach((t) => (t.enabled = !t.enabled));
    }
  }

  function toggleCamera() {
    if (localStreamRef.current) {
      localStreamRef.current
        .getVideoTracks()
        .forEach((t) => (t.enabled = !t.enabled));
    }
  }

  return (
    <div className="p-4">
      <h1 className="text-xl mb-4">Peer-to-Peer Video Call</h1>
      <div className="flex gap-4">
        <div>
          <div>Local</div>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{ width: 300, background: "#000" }}
          />
          {!joined ? (
            <button
              onClick={joinRoom}
              className="px-4 py-2 bg-blue-600 text-white rounded mt-2"
            >
              Join
            </button>
          ) : (
            <button
              onClick={leaveRoom}
              className="px-4 py-2 bg-red-600 text-white rounded mt-2"
            >
              Leave
            </button>
          )}
          <button
            onClick={toggleMute}
            className="ml-2 px-3 py-1 border rounded"
          >
            Mute
          </button>
          <button
            onClick={toggleCamera}
            className="ml-2 px-3 py-1 border rounded"
          >
            Camera
          </button>
        </div>
        <div>
          <div>Remote</div>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{ width: 300, background: "#000" }}
          />
        </div>
      </div>
    </div>
  );
}
