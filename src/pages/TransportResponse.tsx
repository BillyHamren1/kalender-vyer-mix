import { useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

const TransportResponse = () => {
  const [searchParams] = useSearchParams();
  const status = searchParams.get("status");

  const config = {
    accepted: {
      icon: <CheckCircle2 className="w-16 h-16 text-teal-500" />,
      title: "Körning bokad!",
      message: "Tack för ert svar! Ett bekräftelsemejl har skickats till er.",
      bg: "bg-teal-50",
    },
    declined: {
      icon: <XCircle className="w-16 h-16 text-red-500" />,
      title: "Svar registrerat",
      message: "Tack för ert svar. Körningen har registrerats som nekad.",
      bg: "bg-red-50",
    },
    already: {
      icon: <AlertTriangle className="w-16 h-16 text-amber-500" />,
      title: "Redan besvarad",
      message: "Denna förfrågan har redan besvarats. Kontakta oss om ni vill ändra ert svar.",
      bg: "bg-amber-50",
    },
    error: {
      icon: <AlertTriangle className="w-16 h-16 text-red-500" />,
      title: "Något gick fel",
      message: "Ett oväntat fel uppstod. Försök igen senare eller kontakta oss.",
      bg: "bg-red-50",
    },
  };

  const current = config[status as keyof typeof config] || config.error;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f4f5] p-4 font-sans">
      <div className="bg-white rounded-2xl shadow-lg p-12 max-w-md w-full text-center">
        <div className={`w-24 h-24 rounded-full ${current.bg} flex items-center justify-center mx-auto mb-6`}>
          {current.icon}
        </div>
        <h1 className="text-2xl font-bold text-[#1a3a3c] mb-3">{current.title}</h1>
        <p className="text-[#5a6b6d] leading-relaxed mb-8">{current.message}</p>
        <p className="text-xs text-[#7a8b8d]">
          Du kan stänga detta fönster.
        </p>
      </div>
    </div>
  );
};

export default TransportResponse;
