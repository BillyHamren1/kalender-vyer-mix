import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

/**
 * DEPRECATED: "Projektchatt"-modulen ersattes av den enhetliga anslagstavlan
 * (internalnotes) som visas på projektets Översikt-flik.
 *
 * Den här sidan finns kvar enbart för att inte bryta gamla länkar — vi
 * redirectar tyst tillbaka till projektöversikten.
 */
const LargeCollaborationPage = () => {
  const navigate = useNavigate();
  const params = useParams();

  useEffect(() => {
    const projectId = params.id || params.projectId;
    if (projectId) {
      navigate(`/projects/large/${projectId}`, { replace: true });
    } else {
      navigate("/projects", { replace: true });
    }
  }, [navigate, params]);

  return null;
};

export default LargeCollaborationPage;
