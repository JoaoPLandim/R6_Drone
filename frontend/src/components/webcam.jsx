import { useRef, useState } from "react"

// startup setup
export default function WebcamFeed(){
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [isActive, setIsActive] = useState(false);
    const [error, setError] = useState(null);


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
            setIsActive(true);
        } catch (err){
            setError(err.message);
        }
    }

    function stopCamera(){
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        if (videoRef.current) videoRef.current.srcObject = null;
        setIsActive(false);
    }


    return(
        <div>
            <video ref={videoRef} autoPlay playsInline muted width={640} height={480} />
            <div>
                {!isActive ? (
                    <button onClick={startCamera}>Start Camera</button>

                ): (
                    <button onClick={stopCamera}>Stop Camera</button>
                )}
            </div>
            {error && <p style={{ colo: "red"}}>{error}</p>}
        </div>
    )
}