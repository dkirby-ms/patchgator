# Azure hosting

PatchGator runs entirely in the browser. Azure Static Web Apps serves the Vite
build over HTTPS; no application server, database, or Functions API is provisioned.
The default SKU is **Free**. Selecting **Standard** incurs Azure charges.

## One-time Azure setup

Create or choose a dedicated resource group in your existing subscription. The
Bicep template targets that resource group; the publishing identity does not need
subscription-wide Contributor access or permission to create resource groups.

For example, using Azure CLI in PowerShell:

```powershell
az login
az account set --subscription "<subscription-id>"
az provider register --namespace Microsoft.Web --wait
az group create --name "rg-patchgator-prod" --location "westus2"
```

Create an Entra application/service principal or user-assigned managed identity
for GitHub OIDC. Add a federated credential with these exact values:

| Setting | Value |
| --- | --- |
| Issuer | `https://token.actions.githubusercontent.com` |
| Subject | `repo:dkirby-ms/patchgator:environment:azure-production` |
| Audience | `api://AzureADTokenExchange` |

The subject uses the GitHub **environment**, not `ref:refs/heads/master`, because
the publish job is attached to `azure-production`.

Grant the identity **Contributor** on the dedicated resource group. This allows
ARM deployments, Static Web App creation/updates, and retrieval of its upload
token. Use the identity's **principal/object ID**, not its client/application ID:

```powershell
$scope = az group show --name "rg-patchgator-prod" --query id --output tsv
az role assignment create --assignee-object-id "<principal-object-id>" --assignee-principal-type ServicePrincipal --role Contributor --scope $scope
```

An administrator with permission to assign roles must perform this step. The
workflow itself creates no identities, federated credentials, or role assignments.

## GitHub configuration

Create the GitHub environment **azure-production** under repository Settings >
Environments. Restrict its deployment branches to **master**. Add required
reviewers if you want approval before infrastructure changes and publishing.

Set the following GitHub Actions variables at repository or `azure-production`
environment scope:

| Variable | Required | Example/default |
| --- | --- | --- |
| `AZURE_CLIENT_ID` | Yes | OIDC identity's client/application ID |
| `AZURE_TENANT_ID` | Yes | Azure tenant ID |
| `AZURE_SUBSCRIPTION_ID` | Yes | Existing subscription ID |
| `AZURE_RESOURCE_GROUP` | Yes | `rg-patchgator-prod` (must already exist) |
| `AZURE_STATIC_WEB_APP_NAME` | Yes | `swa-patchgator-prod` |
| `AZURE_LOCATION` | No | `westus2` |
| `AZURE_STATIC_WEB_APP_SKU` | No | `Free`; alternatively `Standard` |

Choose a region that supports Static Web Apps. Its location is independent of
the resource group location. Keep the name and region stable after provisioning:
changing the name creates another app, and changing the region requires recreating
the resource. The workflow uses incremental ARM deployment and does not remove
previous resources.

No Azure client secret or `AZURE_STATIC_WEB_APPS_API_TOKEN` GitHub secret is needed.
OIDC authenticates the Azure control-plane operations. The SWA upload action still
requires an app deployment token: the workflow retrieves it using the OIDC
identity, masks it in logs, and passes it only between steps in the same job.
The token is not short-lived just because it was retrieved using OIDC; do not log
it, publish it as an artifact, or expose it in Bicep outputs.

## Publishing

`.github/workflows/publish-azure.yml` replaces the GitHub Pages workflow. On each
push to `master`, it:

1. Installs dependencies, lints, runs unit tests, and builds with `VITE_BASE_PATH=/`.
2. Uploads the build artifact, including `staticwebapp.config.json` copied by Vite
   from `public/`.
3. Signs in using GitHub OIDC and applies `infra/main.bicep` to the configured group.
4. Retrieves the SWA upload token and publishes the prebuilt `dist` directory.
5. Checks the HTTPS endpoint and adds its URL to the deployment environment and
   workflow summary.

You can also run **Publish to Azure Static Web Apps** from the Actions tab using
**Run workflow** on `master`. Manual runs on other branches build only; they cannot
provision or publish. This workflow does not create pull-request preview sites.
Deployments are serialized without cancelling an in-flight ARM deployment/upload.

The Bicep template deliberately omits GitHub repository integration so Azure does
not generate a second workflow or a stored GitHub deployment secret.

After your first successful Azure publish, disable GitHub Pages under Settings >
Pages if you no longer want the old site served. Removing its workflow does not
remove an already-published Pages site. Update external links to the Azure URL
or configure a custom domain in Static Web Apps.

Browser presets remain in local storage on the old site's origin. Export any
presets you want to keep and import them on the Azure site; hosting does not
automatically migrate browser storage. Web MIDI remains subject to browser support
and the user's permission prompt.

## Manual infrastructure validation

From the repository root, using Azure CLI in PowerShell:

```powershell
az bicep build --file .\infra\main.bicep --stdout
az deployment group what-if --resource-group "rg-patchgator-prod" --template-file .\infra\main.bicep --parameters staticWebAppName="swa-patchgator-prod" location="westus2" sku="Free"
```

The first command compiles the template without changing Azure. The second
requires Azure authentication and previews changes without applying them.
The publishing workflow applies the template; you do not need a separate initial
Static Web App deployment.
