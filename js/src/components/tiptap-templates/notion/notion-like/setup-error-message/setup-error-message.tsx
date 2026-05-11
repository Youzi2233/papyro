import "./setup-error-message.scss"
import { Button } from "@/components/tiptap-ui-primitive/button"
import { ExternalLinkIcon } from "@/components/tiptap-icons/external-link-icon"

export interface SetupErrorMessageProps {
  aiSetupError: boolean
  collabSetupError: boolean
}

export function SetupErrorMessage({
  aiSetupError,
  collabSetupError,
}: SetupErrorMessageProps) {
  const guideUrl =
    "https://tiptap.dev/docs/ui-components/templates/notion-like-editor"

  const environmentVariables: Array<{
    name: string
    description: string
  }> = []

  if (collabSetupError) {
    environmentVariables.push(
      {
        name: "TIPTAP_COLLAB_DOC_PREFIX",
        description: "Prefix for identifying collaborative documents",
      },
      {
        name: "TIPTAP_COLLAB_APP_ID",
        description: "Your Document Server App ID",
      },
      {
        name: "TIPTAP_COLLAB_TOKEN",
        description:
          "JWT token for accessing Collaboration services (do not use in production)",
      }
    )
  }

  if (aiSetupError) {
    environmentVariables.push(
      {
        name: "TIPTAP_AI_APP_ID",
        description: "Your AI App ID",
      },
      {
        name: "TIPTAP_AI_TOKEN",
        description:
          "JWT token for accessing AI services (do not use in production)",
      }
    )
  }

  const handleOpenGuide = () => {
    window.open(guideUrl, "_blank")
  }

  return (
    <div className="tiptap-setup-error" role="alert" aria-live="assertive">
      <div className="tiptap-setup-error__container">
        <div className="tiptap-setup-error__content">
          <h2 className="tiptap-setup-error__title">
            Environment Variables Required
          </h2>
          <p className="tiptap-setup-error__message">
            Set up your environment variables to connect to Tiptap Cloud.
          </p>

          <div className="tiptap-setup-error__variables">
            <ul className="tiptap-setup-error__variables-list">
              {environmentVariables.map((envVar) => (
                <li key={envVar.name} className="tiptap-setup-error__variable">
                  <code className="tiptap-setup-error__variable-name">
                    {envVar.name}
                  </code>
                  <span className="tiptap-setup-error__variable-description">
                    {envVar.description}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="tiptap-setup-error__actions">
            <Button
              data-style="primary"
              className="tiptap-setup-error__button"
              onClick={handleOpenGuide}
            >
              <span className="tiptap-button-text">View Setup Guide</span>
              <ExternalLinkIcon className="tiptap-button-icon" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
