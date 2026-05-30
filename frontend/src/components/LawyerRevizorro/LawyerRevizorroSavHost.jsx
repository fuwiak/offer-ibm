import { useEffect, useState } from "react";
import { LAWYER_REVIZORRO_OPEN_SAV_EVENT } from "@/utils/lawyerRevizorro/homeActions";
import SavModal from "@/components/LawyerRevizorro/SavModal";

/** Global SAV modal (home quick action, sidebar, mobile). */
export default function LawyerRevizorroSavHost() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener(LAWYER_REVIZORRO_OPEN_SAV_EVENT, onOpen);
    return () => window.removeEventListener(LAWYER_REVIZORRO_OPEN_SAV_EVENT, onOpen);
  }, []);

  if (!open) return null;
  return <SavModal onClose={() => setOpen(false)} />;
}
