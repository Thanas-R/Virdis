import { Layers, Cloud, MapPin, MessageCircle, Settings, User } from "lucide-react";

const RightToolbar = () => {
  const items = [
  { icon: Layers, label: "Layers" },
  { icon: Cloud, label: "Weather" },
  { icon: MapPin, label: "Location" },
  { icon: MessageCircle, label: "Chat" },
  { icon: Settings, label: "Settings" },
  { icon: User, label: "Profile" }];


  return (
    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-10">
      {items.map(({ icon: Icon, label }) => {}







      )}
    </div>);

};

export default RightToolbar;