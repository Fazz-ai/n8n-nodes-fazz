import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class FazzApi implements ICredentialType {
	name = 'fazzApi';

	displayName = 'Fazz API';

	icon: Icon = { light: 'file:fazz.svg', dark: 'file:fazz.svg' };

	documentationUrl = 'https://github.com/Fazz-ai/n8n-nodes-fazz#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			placeholder: 'e.g. fz_live_…',
			description:
				'The key of a server connection, created in Fazz under Settings › Integrations › Server API. It is shown only once.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			required: true,
			default: 'https://app.fazz.ia.br',
			placeholder: 'e.g. https://app.fazz.ia.br',
			description:
				'The address you open Fazz at. Change it only if your company uses Fazz under its own domain.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL:
				'={{$credentials.baseUrl.trim().replace(/\\/+$/, "").replace(/\\/api\\/v1$/, "")}}/api/v1',
			url: '/me',
			method: 'GET',
			headers: { Accept: 'application/json' },
		},
	};
}
