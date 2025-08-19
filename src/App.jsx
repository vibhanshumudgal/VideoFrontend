import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const SIGNALING_SERVER_URL = "https://videocallbackend-r32a.onrender.com";
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
        audio: true,
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

    socketRef.current.on("other-user", async ({ socketId }) => {
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

    socketRef.current.on("answer", async ({ sdp }) => {
      await peerConnectionRef.current.setRemoteDescription(sdp);
    });

    socketRef.current.on("ice-candidate", async ({ candidate }) => {
      try {
        await peerConnectionRef.current.addIceCandidate(candidate);
      } catch (err) {
        console.error("Error adding ICE candidate", err);
      }
    });

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
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-6">
      <h1 className="text-3xl font-bold mb-6 text-center">
        🎥 Peer-to-Peer Video Call
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-5xl">
        {/* Local Video */}
        <div className="flex flex-col items-center bg-gray-800 rounded-2xl shadow-lg p-4">
          <span className="text-lg font-semibold mb-2">Local</span>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-64 bg-black rounded-lg shadow-md object-cover"
          />
          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            {!joined ? (
              <button
                onClick={joinRoom}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md transition-all"
              >
                Join
              </button>
            ) : (
              <button
                onClick={leaveRoom}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl shadow-md transition-all"
              >
                Leave
              </button>
            )}
            <button
              onClick={toggleMute}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-xl shadow"
            >
              🔇 Mute
            </button>
            <button
              onClick={toggleCamera}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-xl shadow"
            >
              🎥 Camera
            </button>
          </div>
        </div>

        {/* Remote Video */}
        <div className="flex flex-col items-center bg-gray-800 rounded-2xl shadow-lg p-4">
          <span className="text-lg font-semibold mb-2">Remote</span>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-64 bg-black rounded-lg shadow-md object-cover"
          />
        </div>
      </div>
    </div>
  );
}
