from django.db.models.signals import post_save
from django.dispatch import receiver

from catalog.models import StoreCatalogProfile
from stores.models import Store


@receiver(post_save, sender=Store)
def ensure_catalog_profile(sender, instance, created, **kwargs):
    StoreCatalogProfile.objects.get_or_create(store=instance)
