import { useRef, useState, useEffect } from "react";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import "@tensorflow/tfjs";


// startup setup
export default function WebcamFeed(){
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [isActive, setIsActive] = useState(false);
    const [error, setError] = useState(null);
    const canvasRef = useRef(null);
    const modelRef = useRef(null);
    const loopRef = useRef(null);
    const [isLoading, setIsLoading] = useState(false);
    const [detections, setDetections] = useState([]);
    const sessionRef = useRef(null);      // the active session row from the backend
    const lastLoggedRef = useRef({});     // { "person": timestamp, "cup": timestamp }

    // camera startup
    async function startCamera(){
        setError(null);
        try{
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {width: 640, height: 480},
                audio: false,
            });

            streamRef.current = stream;
            videoRef.current.srcObject = stream;

            //load model (cocossd) once, to be reused
            if (!modelRef.current){
                modelRef.current = await cocoSsd.load();
            }

            //start loop to  detect objects
            loopRef.current = setInterval(detectFrame, 400);

            //either find or register this camera in the backend
            const cameras = await (await fetch("/api/cameras")).json();
            let cam = cameras.find((c) => c.kind === "webcam");
            if (!cam) {
            cam = await (
                await fetch("/api/cameras", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "Laptop webcam", kind: "webcam" }),
                })
            ).json();
            }

            //open session
            sessionRef.current = await (
            await fetch("/api/sessions/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ camera_id: cam.id }),
            })
            ).json();

            setIsActive(true);
        } catch (err){
            setError(err.message);
        }
    }

    function stopCamera(){
        clearInterval(loopRef.current);
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        if (sessionRef.current) {
        fetch(`/api/sessions/${sessionRef.current.id}/stop`, { method: "POST" }).catch(() => {});
        sessionRef.current = null;
    }
        if (videoRef.current) videoRef.current.srcObject = null;
        const ctx = canvasRef.current?.getContext("2d");
        ctx?.clearRect(0, 0, 640, 480);
        setDetections([]);
        setIsActive(false);
    }

    async function detectFrame(){
        const video = videoRef.current;
        const model = modelRef.current;
        if(!video || !model || video.readyState < 2){
            return;
        }

        const preds = (await model.detect(video)).filter((p) => p.score >= 0.55);
        setDetections(preds);
        drawBoxes(preds);
        const now = Date.now();
        for (const p of preds) {
        const last = lastLoggedRef.current[p.class] ?? 0;
        if (now - last > 10000 && sessionRef.current) {
            lastLoggedRef.current[p.class] = now;
            fetch("/api/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                session_id: sessionRef.current.id,
                label: p.class,
                score: Number(p.score.toFixed(3)),
                bbox: p.bbox.map((n) => Math.round(n)),
            }),
            }).catch(() => {});
        }
        }
    }

    function drawBoxes(preds){
        const canvas = canvasRef.current;
        if(!canvas) return;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "lime";
        ctx.fillStyle = "lime";
        ctx.font = "16px monospace";
        for(const p of preds){
            const [x, y, w, h] = p.bbox;
            ctx.strokeRect(x, y, w, h);
            ctx.fillText(`${p.class} ${(p.score * 100).toFixed(0)}%`, x+4, y-6);
        }
    }

    useEffect(() => {
        return () => stopCamera();
    }, []);

    return(
        <div>
            <div style={{ position: "relative", width: 640, height: 480 }}>
                <video ref={videoRef} autoPlay playsInline muted width={640} height={480} />
                <canvas
                ref={canvasRef}
                width={640}
                height={480}
                style={{ position: "absolute", top: 0, left: 0 }}
                />
            </div>
            <div>
                {!isActive ? (
                <button onClick={startCamera} disabled={isLoading}>
                    {isLoading ? "Loading model…" : "Start Camera"}
                </button>
                ) : (
                <button onClick={stopCamera}>Stop Camera</button>
                )}
            </div>
            <p>
                {detections.length === 0
                ? "No objects detected"
                : detections.map((d) => `${d.class} (${(d.score * 100).toFixed(0)}%)`).join(" · ")}
            </p>
            {error && <p style={{ color: "red" }}>{error}</p>}
        </div>
    )
}