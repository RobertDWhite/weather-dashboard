# Kubernetes deployment

These manifests are an example, not a turnkey deployment. You will need to:

1. Adjust the image references in `kustomization.yaml` if you push to a different registry.
2. Set a `storageClassName` in `pvc.yaml` (or remove the line to use the cluster default).
3. Edit `ingress.yaml` for your hostname / ingress controller, or delete it and front the UI yourself.
4. Edit `configmap.yaml` with your observer location, NWS User-Agent, and any webhook targets.

For real-world deployments, replace the inline ConfigMap with a SOPS / Sealed-Secrets / External-Secrets backed Secret if your webhook URLs or API keys are sensitive.

## Apply

```bash
kubectl apply -k deploy/k8s/
```

## Update

After pushing a new API or UI image, bump the `newTag` value in `kustomization.yaml` and re-apply.
