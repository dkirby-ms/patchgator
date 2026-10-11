targetScope = 'resourceGroup'

@description('Name of the Azure Static Web App.')
@minLength(1)
@maxLength(40)
param staticWebAppName string

@description('Azure region for the Static Web App. Independent of the resource group location.')
param location string = 'westus2'

@description('Free is sufficient for this client-side app. Standard is a paid tier.')
@allowed([
  'Free'
  'Standard'
])
param sku string = 'Free'

resource staticWebApp 'Microsoft.Web/staticSites@2024-11-01' = {
  name: staticWebAppName
  location: location
  tags: {
    application: 'patchgator'
    managedBy: 'bicep'
  }
  sku: {
    name: sku
    tier: sku
  }
  properties: {}
}

output staticWebAppName string = staticWebApp.name
output staticWebAppResourceId string = staticWebApp.id
output staticWebAppUrl string = 'https://${staticWebApp.properties.defaultHostname}'
