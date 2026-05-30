import { useEffect, useState } from "react";
import { OFFER_KP_OPEN_SAV_EVENT } from "@/utils/offerKp/homeActions";
import SavModal from "@/components/OfferKp/SavModal";

/** Global SAV modal (home quick action, sidebar, mobile). */
export default function OfferKpSavHost() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener(OFFER_KP_OPEN_SAV_EVENT, onOpen);
    return () => window.removeEventListener(OFFER_KP_OPEN_SAV_EVENT, onOpen);
  }, []);

  if (!open) return null;
  return <SavModal onClose={() => setOpen(false)} />;
}
