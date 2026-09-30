# Study Planner on Kubernetes

A beginner-friendly guide to running the Study Planner (Next.js) on a local
Kubernetes cluster (kind or minikube). Run all commands from the repo root.

## What each manifest is for

| File | What it does |
| --- | --- |
| `namespace.yaml` | Creates the `study-planner` namespace, a folder-like space that keeps our objects together. |
| `deployment.yaml` | Runs 2 copies (pods) of the app, restarts them if they crash, and defines probes, resources and security settings. |
| `service.yaml` | Gives the pods one stable internal address (port 80 -> container port 3000) and load-balances between them. |
| `ingress.yaml` | Routes browser traffic for `study-planner.local` to the Service (needs the nginx ingress controller). |
| `hpa.yaml` | Auto-scales between 2 and 6 pods when average CPU goes above 70% (needs metrics-server). |
| `pdb.yaml` | PodDisruptionBudget: during node maintenance, keep at least 1 pod running. |
| `networkpolicy.yaml` | Firewall: only ingress-nginx may reach the app; the app may only do DNS and HTTPS (Claude API). |
| `secret.example.yaml` | Example Secret for `ANTHROPIC_API_KEY`. Copy it, never commit real keys. Not applied by `kubectl apply -k`. |
| `kustomization.yaml` | Lists the files above so one command applies them all and sets the namespace and labels. |

## 1. Build the image

```bash
docker build -t study-planner:latest apps/study-planner
```

## 2. Load the image into your cluster

The Deployment uses `imagePullPolicy: IfNotPresent`, so the image must already
exist inside the cluster (it is not on a registry).

```bash
# kind
kind load docker-image study-planner:latest
# minikube
minikube image load study-planner:latest
```

## 3. (Optional) Create the API key secret

Without a key the app runs in offline mode. To enable the Claude pipeline:

```bash
kubectl create namespace study-planner   # skip if it already exists
kubectl -n study-planner create secret generic study-planner-secrets \
  --from-literal=ANTHROPIC_API_KEY='sk-ant-your-key'
```

If you create the secret after the pods started, restart them:
`kubectl -n study-planner rollout restart deployment/study-planner`.

## 4. Deploy

```bash
kubectl apply -k k8s/study-planner
kubectl -n study-planner get pods -w
```

## 5. Open it in the browser

The Ingress needs an ingress controller:

```bash
# kind: your cluster must be created with ingress-ready port mappings, see kind docs
kubectl apply -f https://kind.sigs.k8s.io/examples/ingress/deploy-ingress-nginx.yaml
# minikube
minikube addons enable ingress
```

Then map the hostname to your cluster (kind on localhost: `127.0.0.1`;
minikube: the output of `minikube ip`):

```bash
echo "127.0.0.1 study-planner.local" | sudo tee -a /etc/hosts
```

Visit http://study-planner.local. Health check: http://study-planner.local/api/health

### No Ingress? Use port-forward

```bash
kubectl -n study-planner port-forward svc/study-planner 8080:80
# open http://localhost:8080
```

## Troubleshooting

```bash
kubectl -n study-planner get pods                      # status, restarts
kubectl -n study-planner describe pod <pod-name>       # events: image pull, probe or scheduling errors
kubectl -n study-planner logs deploy/study-planner     # app logs (add -f to follow, --previous after a crash)
kubectl -n study-planner get svc,ingress,hpa,pdb       # everything else
kubectl -n study-planner get endpoints study-planner   # empty = no ready pods behind the Service
kubectl kustomize k8s/study-planner                    # preview the rendered YAML
```

- `ErrImagePull` / `ImagePullBackOff`: you forgot step 2 (load the image), or the name/tag differs.
- Pods `Running` but `0/1 Ready`: the `/api/health` probe is failing; check logs.
- HPA shows `<unknown>` CPU: metrics-server is not installed (`minikube addons enable metrics-server`).
- Ingress returns 504 or times out: the app is slow; the timeout is set to 120s in `ingress.yaml`.
- NetworkPolicy is only enforced if your CNI supports it (kind's default CNI does not; Calico/Cilium do).

## Clean up

```bash
kubectl delete -k k8s/study-planner
```
