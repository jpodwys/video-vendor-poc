import { useCallback, useState } from "react";
import VideoApp from "./components/VideoApp";
import { TwilioRoom } from "./video-core/adapters/VideoCoreTwilio";
import { VonageRoom } from "./video-core/adapters/VideoCoreVonage";
import { Room } from "./video-core/abstract/VideoCore";

type Vendor = 'twilio' | 'vonage';

const LocalStorageRoomNameKey = 'RoomName';
const LocalStorageRoomTokenLey = 'RoomToken';

function videoCoreRoomFactory(vendor: Vendor): Room {
  switch(vendor) {
    case 'twilio': return new TwilioRoom();
    case 'vonage': return new VonageRoom();
  }
}

function App() {
  const [room, setRoom] = useState<Room | undefined>();
  const [roomName, setRoomName] = useState(localStorage.getItem(LocalStorageRoomNameKey) || '');
  const [roomToken, setRoomToken] = useState(localStorage.getItem(LocalStorageRoomTokenLey) || '');

  const updateRoom = useCallback((vendor: Vendor) => {
    setRoom(videoCoreRoomFactory(vendor));
    localStorage.setItem(LocalStorageRoomNameKey, roomName);
    localStorage.setItem(LocalStorageRoomTokenLey, roomToken);
  }, [roomName, roomToken]);

  return (
    <div>
      {!room && (
        <>
          <h1>Select Vendor</h1>
          <div>
            <input placeholder="Room Name" value={roomName} onChange={(e) => setRoomName(e.target.value)} />
            <input placeholder="Room Token" value={roomToken} onChange={(e) => setRoomToken(e.target.value)} />
          </div>
          <div>
            <button disabled={!roomName || !roomToken} onClick={() => updateRoom('twilio')}>Twilio</button>
            <button disabled={!roomName || !roomToken} onClick={() => updateRoom('vonage')}>Vonage</button>
          </div>
        </>
      )}
      {room && roomName && roomToken && (
        <VideoApp room={room} roomName={roomName} roomToken={roomToken} />
      )}
    </div>
  );
}

export default App;
